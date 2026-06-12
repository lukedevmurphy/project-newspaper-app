// Detect photographs/portraits/engravings on full-page scans.
//
// A Sonnet vision pass per page: find image regions, transcribe their
// captions VERBATIM, name the people the caption names, and describe
// the region in neutral terms. Identity is NEVER asked of the model —
// captions + role corroboration carry identification, and the user
// makes the final call (the architecture proven by the existing
// archive/photos/.../CONFIDENCE.md work).
//
// Outputs:
//   data-cache/page-photos/<page_id>.json
//   data-cache/page-photos/REVIEW.md   — pages whose captions name a
//                                        watchlist surname, for review
//
// Usage mirrors the other generators:
//   node scripts/generate-page-photo-regions.mjs [--limit N] [--ids a,b] [--force] [--watch "Murphy,Kelly"]

import { existsSync, readFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';
const PROMPT_VERSION = '2026-06-12-v1';
const CACHE_DIR = resolve('data-cache/page-photos');
const MAX_IMAGE_BYTES = Math.floor(5 * 1024 * 1024 * 3 / 4) - 64 * 1024;
const DEFAULT_WATCHLIST = ['Murphy', 'Lyne', 'Lynn', 'Kelly', 'Sullivan', 'Maloughney', 'Maloney', 'Shea', 'Harrington', 'Gallagher', 'Softley'];

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
  return sharp(buffer)
    .rotate()
    .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 55, mozjpeg: true })
    .toBuffer();
}

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

const SYSTEM_PROMPT = `You are surveying a full-page scan of a historical newspaper (19th/early-20th-century US/UK/Irish press) for PHOTOGRAPHS and other pictorial content, for a family-history research archive.

Find every photograph, engraved portrait, halftone, illustration, or political cartoon on the page. Ignore decorative rules, masthead art, and small stock ad-cuts (pointing hands, product line-art) unless they depict an identifiable person.

For each region report:
- kind: "portrait" (single person), "group_photo", "engraving" (engraved/woodcut portrait or scene), "scene" (news photo of an event/place), "cartoon", or "other_image".
- bbox_pct: the region's bounding box as PERCENTAGES of the page — { "l": left, "t": top, "r": right, "b": bottom }, each 0-100. Estimate carefully; the crop tool pads your box, so approximate is acceptable but try to contain the entire region including its caption.
- caption_as_printed: the caption text VERBATIM, exactly as printed (preserve capitalisation; use [word?] for uncertain words). Empty string if no caption.
- people_named_in_caption: array of personal names as printed in the caption (empty if none).
- description: 1-2 sentences describing the image content in neutral terms — composition, number of figures, setting, approximate age/dress of figures. DO NOT speculate about who unidentified figures are; identity comes from captions and the archive's own corroboration, not from you.

Return an empty regions array if the page has no pictorial content.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    regions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['portrait', 'group_photo', 'engraving', 'scene', 'cartoon', 'other_image'] },
          bbox_pct: {
            type: 'object',
            properties: {
              l: { type: 'number' }, t: { type: 'number' }, r: { type: 'number' }, b: { type: 'number' },
            },
            required: ['l', 't', 'r', 'b'],
            additionalProperties: false,
          },
          caption_as_printed: { type: 'string' },
          people_named_in_caption: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
        },
        required: ['kind', 'bbox_pct', 'caption_as_printed', 'people_named_in_caption', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['regions'],
  additionalProperties: false,
};

async function main() {
  loadDotEnvLocal();

  const { values } = parseArgs({
    options: {
      limit: { type: 'string' },
      ids: { type: 'string' },
      force: { type: 'boolean', default: false },
      watch: { type: 'string' },
    },
  });
  const limit = values.limit ? parseInt(values.limit, 10) : null;
  const onlyIds = values.ids ? new Set(values.ids.split(',').map(s => s.trim())) : null;
  const force = values.force;
  const watchlist = (values.watch ? values.watch.split(',').map(s => s.trim()) : DEFAULT_WATCHLIST)
    .map(s => s.toLowerCase());

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[photos] ANTHROPIC_API_KEY missing — add it to .env.local');
    process.exit(1);
  }

  const dataRoot = resolveDataRoot();
  const pagesDir = join(dataRoot, 'archive', 'pages');
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`[photos] data root: ${dataRoot}`);

  const allIds = readdirSync(pagesDir)
    .filter(name => {
      try { return statSync(join(pagesDir, name)).isDirectory(); } catch { return false; }
    })
    .filter(name => existsSync(join(pagesDir, name, 'fullpage.jpg')))
    .sort();
  let ids = onlyIds ? allIds.filter(id => onlyIds.has(id)) : allIds;
  if (limit != null) ids = ids.slice(0, limit);
  console.log(`[photos] ${ids.length} page(s) selected (of ${allIds.length} with images).\n`);

  const client = new Anthropic();
  let generated = 0, skipped = 0, failed = 0;
  const totals = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };

  for (const id of ids) {
    const imageBytes = readFileSync(join(pagesDir, id, 'fullpage.jpg'));
    const hash = `sha256:${createHash('sha256').update(`${PROMPT_VERSION}\n${MODEL}\n`).update(imageBytes).digest('hex').slice(0, 16)}`;
    const cachePath = join(CACHE_DIR, `${id}.json`);

    if (!force && existsSync(cachePath)) {
      try {
        const prior = JSON.parse(readFileSync(cachePath, 'utf-8'));
        if (prior.input_hash === hash) {
          skipped++;
          continue;
        }
      } catch { /* regenerate */ }
    }

    const sendBytes = await fitForApi(imageBytes);
    process.stdout.write(`[gen]  ${id} ... `);
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: sendBytes.toString('base64') } },
              { type: 'text', text: `Page ID: ${id}. Survey this page for pictorial content per the system prompt.` },
            ],
          },
        ],
      });
      if (response.stop_reason === 'refusal') throw new Error('model refused the request');
      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock) throw new Error('no text block in response');
      const parsed = JSON.parse(textBlock.text);

      const usage = response.usage;
      totals.input += usage.input_tokens ?? 0;
      totals.output += usage.output_tokens ?? 0;
      totals.cacheCreate += usage.cache_creation_input_tokens ?? 0;
      totals.cacheRead += usage.cache_read_input_tokens ?? 0;

      writeFileSync(cachePath, JSON.stringify({
        id,
        input_hash: hash,
        prompt_version: PROMPT_VERSION,
        model: MODEL,
        generated_at: new Date().toISOString(),
        regions: parsed.regions,
      }, null, 2));
      console.log(`ok (${parsed.regions.length} regions)`);
      generated++;
    } catch (err) {
      console.log(`FAIL — ${err.message}`);
      failed++;
    }
  }

  writeReview(watchlist);

  console.log('');
  console.log(`[photos] done. generated=${generated} skipped=${skipped} failed=${failed}`);
  console.log(`[photos] tokens: input=${totals.input} output=${totals.output} cache_create=${totals.cacheCreate} cache_read=${totals.cacheRead}`);
  const costUsd =
    (totals.input * 3) / 1_000_000 +
    (totals.output * 15) / 1_000_000 +
    (totals.cacheCreate * 3.75) / 1_000_000 +
    (totals.cacheRead * 0.3) / 1_000_000;
  console.log(`[photos] est cost: $${costUsd.toFixed(4)}`);
  console.log(`[photos] review: ${join(CACHE_DIR, 'REVIEW.md')}`);
}

function writeReview(watchlist) {
  const hits = [];
  let pageCount = 0, regionCount = 0;
  for (const file of readdirSync(CACHE_DIR).filter(f => f.endsWith('.json')).sort()) {
    let record;
    try { record = JSON.parse(readFileSync(join(CACHE_DIR, file), 'utf-8')); } catch { continue; }
    pageCount++;
    for (const r of record.regions ?? []) {
      regionCount++;
      const namesLower = (r.people_named_in_caption ?? []).map(n => n.toLowerCase());
      const watched = namesLower.some(n => watchlist.some(w => n.includes(w)));
      if (watched) hits.push({ page: record.id, ...r });
    }
  }
  const lines = [
    '# Photo-region review',
    '',
    `Generated ${new Date().toISOString()} over ${pageCount} pages (${regionCount} pictorial regions).`,
    '',
    'Regions whose captions name a watchlist surname. To crop candidates for',
    'review, run:',
    '',
    '    node scripts/crop-photo-candidates.mjs --ids <page_id> --person <person_id>',
    '',
    `## Watchlist caption hits (${hits.length})`,
    '',
  ];
  for (const h of hits) {
    lines.push(`- **${h.page}** — ${h.kind}, bbox l${h.bbox_pct.l} t${h.bbox_pct.t} r${h.bbox_pct.r} b${h.bbox_pct.b}`);
    lines.push(`  names: ${h.people_named_in_caption.join('; ')}`);
    if (h.caption_as_printed) lines.push(`  > ${h.caption_as_printed.replace(/\s+/g, ' ').slice(0, 300)}`);
  }
  lines.push('');
  writeFileSync(join(CACHE_DIR, 'REVIEW.md'), lines.join('\n'));
}

main().catch(err => { console.error(err); process.exit(1); });
