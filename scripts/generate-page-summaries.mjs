// Generate AI vision summaries for full-page scans in the data repo.
//
// For each page under archive/pages/<id>/, read page_metadata.yaml +
// fullpage.jpg, call Claude (vision) with a cached system prompt, and
// write data-cache/page-summaries/<id>.json. Hash-check skips pages
// whose inputs are unchanged.
//
// Usage:
//   node scripts/generate-page-summaries.mjs                # all pages
//   node scripts/generate-page-summaries.mjs --limit 3      # first 3
//   node scripts/generate-page-summaries.mjs --ids a,b,c    # specific IDs
//   node scripts/generate-page-summaries.mjs --force        # ignore hash

import { existsSync, readFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import yaml from 'js-yaml';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';

// Anthropic's per-image cap is 5 MB base64. Raw JPEG limit (with safety
// margin for base64's 4/3 inflation): ~3.6 MB.
const MAX_IMAGE_BYTES = Math.floor(5 * 1024 * 1024 * 3 / 4) - 64 * 1024;

async function fitForApi(buffer) {
  if (buffer.length <= MAX_IMAGE_BYTES) return buffer;
  for (const q of [85, 75, 65, 55]) {
    const resized = await sharp(buffer)
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: q, mozjpeg: true })
      .toBuffer();
    if (resized.length <= MAX_IMAGE_BYTES) return resized;
  }
  // Last resort: smaller dimension cap.
  return sharp(buffer)
    .rotate()
    .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 55, mozjpeg: true })
    .toBuffer();
}

const MODEL = 'claude-sonnet-4-6';
const PROMPT_VERSION = '2026-05-12-v1';

const CACHE_DIR = resolve('data-cache/page-summaries');

// ---- .env.local loader (mirrors clone-data.mjs) ------------------------

function loadDotEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const rawLine of readFileSync('.env.local', 'utf-8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, key, valRaw] = m;
    if (process.env[key]) continue;
    process.env[key] = valRaw.replace(/^["']|["']$/g, '').trim();
  }
}

function resolveDataRoot() {
  const fromEnv = process.env.NEWSPAPER_DATA_PATH;
  if (fromEnv) {
    const r = resolve(fromEnv);
    if (!existsSync(r)) throw new Error(`NEWSPAPER_DATA_PATH=${r} does not exist`);
    if (!existsSync(join(r, 'archive'))) throw new Error(`NEWSPAPER_DATA_PATH=${r} has no archive/ dir`);
    return r;
  }
  for (const candidate of ['./data', '../project-newspaper-data', '../newspaper']) {
    const r = resolve(process.cwd(), candidate);
    if (existsSync(r) && existsSync(join(r, 'archive'))) return r;
  }
  throw new Error('Cannot find newspaper data repo. Set NEWSPAPER_DATA_PATH in .env.local.');
}

// ---- Prompt (cacheable) -----------------------------------------------

const SYSTEM_PROMPT = `You are surveying full-page scans of historical newspapers from a private family-history archive. The archive supports a book grounded in primary sources, tracing one family's arc through 19th-century West Cork, Land League-era Ireland, and Irish-American emigration to Butte/Anaconda and Jamestown, Dakota Territory.

You receive an image of a single page, plus a short header describing which clippings have already been pulled out of that page as their own records. Your job: tell the writer what *else* is going on around those clippings — the editorial neighbourhood the clipping lived in, what the page's most visible headlines were, where on the page the clipping sat, and any striking visual or thematic juxtapositions.

This is the "wide angle" on a clipping. The clipping summaries (already generated separately) are the "close up". Together they give the writer enough sense of the page to describe the moment a reader would have encountered the story.

## Output

Return JSON with exactly four fields:

- **summary** — one paragraph (3-5 sentences) describing the page as a whole. What kind of page is it (front page / interior / advertising / classifieds)? What is the dominant subject matter? What is the editorial tone? Aim for a single tight paragraph; do not list items. Faithful description, no speculation.

- **headlines** — an array of 4-10 strings. The most visible headlines or display-type lines on the page, as they appear on the page. Include section heads ("LOCAL BREVITIES", "TELEGRAPHIC"), banner headlines, and major story headlines. Exclude ad copy, dateline strings, and tiny in-body subheads. Preserve period capitalisation.

- **clipping_placements** — an array of objects, one per clipping ID listed in the input header. Fields per object:
  - \`clipping_id\` — the id string as given.
  - \`prominence\` — one of: \`lead\` | \`secondary\` | \`buried\`. See judgment guide below.
  - \`column\` — a short string describing where the clipping sits horizontally. Use "col 1 (leftmost)", "col 3", "col 4 (rightmost)" etc. for multi-column papers; "left", "center", "right" for simpler layouts. If a clipping straddles columns, name where it starts.
  - \`placement_note\` — optional short string (under 25 words) noting any visual context the prominence + column don't capture: "directly below the lead market report", "above the fold", "in a black-bordered death notices column", "set as a brief between two longer features", etc. Omit if there's nothing useful to add.

- **juxtapositions** — an array of 0-3 strings, each one sentence. Notable visual or thematic neighbourhoods on the page — the kind of detail a writer might want for atmosphere. Examples: "The Berehaven correspondent's letter on famine deaths sits one column over from an advert offering passage to America at three guineas." "The Murphy infant death notice runs in the same column-foot as a notice for a daughter's piano recital that evening." Be specific; give the items and the relation. Skip if nothing stands out — an empty array is fine.

## Prominence — judgment guide

- **lead**: top of the page or top of its column, with a larger or boldface headline relative to what surrounds it; the kind of item a casual reader's eye lands on first. A clipping at the bottom of column 1 still counts as lead if it's the day's banner story.
- **secondary**: visible mid-page or mid-column, normal-weight headline. Standard editorial weight — present but not the headline grab.
- **buried**: lower-page or interior, set as a short brief among longer items, or under a generic section heading like "LOCAL BREVITIES" or "PERSONAL". Easy to miss on a quick scan.

If a clipping is the *only* substantial item on a page that's otherwise ads/classifieds, treat it as \`lead\`. If a clipping has a large headline but sits below another large headline that's clearly the day's top story, it's \`secondary\`.

## Column — guidance

- Newspaper pages in this corpus are typically 4-7 columns wide. Count from left, leftmost = col 1.
- If the page layout is unusual (broadsheet with non-uniform columns, a full-page ad, a tabloid layout), describe in plain English: "left half, upper third", "middle, set as a boxed feature", etc.

## Style

- Plain English. The summary paragraph should read like a curator's note, not a press release.
- Do not pad. If the page is mostly ads with one short news item, say so.
- Trust what you can see. Do not infer beyond the page. If you cannot tell whether a headline is "TELEGRAPHIC" or "TELEGRAPHIC NEWS", quote what you can read.
- Do not refer to "the page" or "this page" in the summary paragraph. Describe the contents directly.
  - Good: "A front page dominated by telegraphic news from London and a market column at the foot."
  - Bad: "This page is a front page that contains telegraphic news from London..."
- Headlines are returned as a flat array of strings — no nesting, no annotations.

## Worked example (text-only sketch — the real input includes an image)

Input header:
> Page ID: 1846-12-31_times-london_p08
> Newspaper: The Times (London) — 1846-12-31, p.8
>
> Clippings on this page:
>   - 1846-12-31_times-london_berehaven-starvation: A correspondent from Berehaven describes the collapse of famine relief and the starvation death of Timothy Sullivan of Coulagh.

Plausible good output:
\`\`\`json
{
  "summary": "An interior news page of The Times for the last day of 1846, given over almost entirely to Irish distress and English commentary on it. Dense type, six columns, no display advertising. Three correspondent letters from West Cork sit alongside a leader on relief policy and a column of telegraphic dispatches from the Continent.",
  "headlines": [
    "IRELAND",
    "THE FAMINE",
    "BEREHAVEN",
    "NEGLECT OF AGRICULTURE",
    "FOREIGN INTELLIGENCE",
    "POSTSCRIPT"
  ],
  "clipping_placements": [
    {
      "clipping_id": "1846-12-31_times-london_berehaven-starvation",
      "prominence": "lead",
      "column": "col 2",
      "placement_note": "below the IRELAND section banner, top half of the column; signed but anonymous correspondent"
    }
  ],
  "juxtapositions": [
    "The Berehaven correspondent's letter on starvation deaths is followed directly by a sub-heading reading NEGLECT OF AGRICULTURE, framing the death as part of an editorial argument."
  ]
}
\`\`\`

## Reminders

- You will receive ONE page image and a short header. Use both.
- The header lists clippings that have already been processed as their own records — your job is to place them on the page and describe their neighbourhood, not to re-summarise them.
- If you cannot reliably read any of the page (faded scan, half cut off, blank), say so in the summary paragraph and return empty arrays where you cannot speak.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    headlines: { type: 'array', items: { type: 'string' } },
    clipping_placements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clipping_id: { type: 'string' },
          prominence: { type: 'string', enum: ['lead', 'secondary', 'buried'] },
          column: { type: 'string' },
          placement_note: { type: 'string' },
        },
        required: ['clipping_id', 'prominence', 'column'],
        additionalProperties: false,
      },
    },
    juxtapositions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'headlines', 'clipping_placements', 'juxtapositions'],
  additionalProperties: false,
};

// ---- Per-page payload --------------------------------------------------

function buildHeader(pageMeta, clippingHints) {
  const lines = [];
  lines.push(`Page ID: ${pageMeta.id}`);
  lines.push(`Newspaper: ${pageMeta.newspaper}${pageMeta.city ? ` (${pageMeta.city})` : ''} — ${pageMeta.date}, p.${pageMeta.page}`);
  if (pageMeta.url) lines.push(`URL: ${pageMeta.url}`);
  lines.push('');
  if (clippingHints.length === 0) {
    lines.push('Clippings on this page: none recorded.');
  } else {
    lines.push('Clippings on this page:');
    for (const c of clippingHints) {
      const headline = c.headline ? ` — "${c.headline}"` : '';
      lines.push(`  - ${c.id}${headline}: ${c.summary}`);
    }
  }
  if (pageMeta.peripheral_items && pageMeta.peripheral_items.length > 0) {
    lines.push('');
    lines.push('Items I already noted on this page (do not re-list, but use as context):');
    for (const p of pageMeta.peripheral_items) {
      lines.push(`  - ${p.title}: ${(p.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)}`);
    }
  }
  return lines.join('\n');
}

function loadClippingHints(dataRoot, clippingIds) {
  const hints = [];
  for (const id of clippingIds) {
    const metaPath = join(dataRoot, 'archive', 'clippings', id, 'metadata.yaml');
    if (!existsSync(metaPath)) {
      hints.push({ id, headline: '', summary: '(metadata missing)' });
      continue;
    }
    const meta = yaml.load(readFileSync(metaPath, 'utf-8'));
    hints.push({
      id,
      headline: meta.headline || '',
      summary: (meta.summary || '').replace(/\s+/g, ' ').trim().slice(0, 400),
    });
  }
  return hints;
}

// ---- Hash ---------------------------------------------------------------

function inputHash(pageMeta, header, imageBytes) {
  const h = createHash('sha256');
  h.update(`prompt:${PROMPT_VERSION}\n`);
  h.update(`model:${MODEL}\n`);
  h.update(`pagemeta:${JSON.stringify(pageMeta)}\n`);
  h.update(`header:${header}\n`);
  h.update('image:');
  h.update(imageBytes);
  return `sha256:${h.digest('hex').slice(0, 16)}`;
}

// ---- Main ---------------------------------------------------------------

async function main() {
  loadDotEnvLocal();

  const { values } = parseArgs({
    options: {
      limit: { type: 'string' },
      ids: { type: 'string' },
      force: { type: 'boolean', default: false },
    },
  });
  const limit = values.limit ? parseInt(values.limit, 10) : null;
  const onlyIds = values.ids ? new Set(values.ids.split(',').map(s => s.trim())) : null;
  const force = values.force;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[generate-pages] ANTHROPIC_API_KEY missing — add it to .env.local');
    process.exit(1);
  }

  const dataRoot = resolveDataRoot();
  const pagesDir = join(dataRoot, 'archive', 'pages');
  console.log(`[generate-pages] data root: ${dataRoot}`);
  console.log(`[generate-pages] cache dir: ${CACHE_DIR}`);

  mkdirSync(CACHE_DIR, { recursive: true });

  const allIds = readdirSync(pagesDir)
    .filter(name => {
      try { return statSync(join(pagesDir, name)).isDirectory(); } catch { return false; }
    })
    .sort();

  let ids = onlyIds ? allIds.filter(id => onlyIds.has(id)) : allIds;
  if (limit != null) ids = ids.slice(0, limit);

  console.log(`[generate-pages] ${ids.length} page(s) selected (of ${allIds.length} total).\n`);

  const client = new Anthropic();
  let generated = 0, skipped = 0, failed = 0;
  const totals = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };

  for (const id of ids) {
    const metaPath = join(pagesDir, id, 'page_metadata.yaml');
    const imagePath = join(pagesDir, id, 'fullpage.jpg');
    if (!existsSync(metaPath) || !existsSync(imagePath)) {
      console.log(`[skip] ${id}: missing page_metadata.yaml or fullpage.jpg`);
      skipped++;
      continue;
    }
    const pageMeta = yaml.load(readFileSync(metaPath, 'utf-8'));
    const imageBytes = readFileSync(imagePath);

    const clippingHints = loadClippingHints(dataRoot, pageMeta.clippings || []);
    const header = buildHeader(pageMeta, clippingHints);
    const hash = inputHash(pageMeta, header, imageBytes);

    const cachePath = join(CACHE_DIR, `${id}.json`);
    if (!force && existsSync(cachePath)) {
      try {
        const prior = JSON.parse(readFileSync(cachePath, 'utf-8'));
        if (prior.input_hash === hash && prior.model === MODEL && prior.prompt_version === PROMPT_VERSION) {
          console.log(`[skip] ${id}: hash match`);
          skipped++;
          continue;
        }
      } catch { /* fall through and regenerate */ }
    }

    const sendBytes = await fitForApi(imageBytes);
    const imageB64 = sendBytes.toString('base64');
    const sizeNote = sendBytes.length === imageBytes.length
      ? `${(imageBytes.length / 1024 / 1024).toFixed(1)}MB`
      : `${(imageBytes.length / 1024 / 1024).toFixed(1)}MB → ${(sendBytes.length / 1024 / 1024).toFixed(1)}MB`;
    process.stdout.write(`[gen]  ${id} (${sizeNote}) ... `);

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        output_config: {
          format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageB64 } },
              { type: 'text', text: header },
            ],
          },
        ],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock) throw new Error('no text block in response');
      const parsed = JSON.parse(textBlock.text);

      const usage = response.usage;
      totals.input += usage.input_tokens ?? 0;
      totals.output += usage.output_tokens ?? 0;
      totals.cacheCreate += usage.cache_creation_input_tokens ?? 0;
      totals.cacheRead += usage.cache_read_input_tokens ?? 0;

      const record = {
        id,
        input_hash: hash,
        prompt_version: PROMPT_VERSION,
        model: MODEL,
        generated_at: new Date().toISOString(),
        summary: parsed.summary,
        headlines: parsed.headlines,
        clipping_placements: parsed.clipping_placements,
        juxtapositions: parsed.juxtapositions,
        usage: {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens,
          cache_read_input_tokens: usage.cache_read_input_tokens,
        },
      };
      writeFileSync(cachePath, JSON.stringify(record, null, 2));
      console.log(`ok (in=${usage.input_tokens}/cached_read=${usage.cache_read_input_tokens ?? 0}, out=${usage.output_tokens})`);
      generated++;
    } catch (err) {
      console.log(`FAIL — ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`[generate-pages] done. generated=${generated} skipped=${skipped} failed=${failed}`);
  console.log(`[generate-pages] tokens: input=${totals.input} output=${totals.output} cache_create=${totals.cacheCreate} cache_read=${totals.cacheRead}`);
  const costUsd =
    (totals.input * 3) / 1_000_000 +
    (totals.output * 15) / 1_000_000 +
    (totals.cacheCreate * 3.75) / 1_000_000 +
    (totals.cacheRead * 0.3) / 1_000_000;
  console.log(`[generate-pages] est cost: $${costUsd.toFixed(4)} (sonnet 4.6: $3 in / $15 out / $3.75 cache-write / $0.30 cache-read per 1M)`);
}

main().catch(err => { console.error(err); process.exit(1); });
