// Generate AI prose summaries for clippings in the data repo.
//
// For each clipping under archive/clippings/<id>/, read metadata.yaml +
// transcription.md, call Claude with a cached system prompt, and write
// data-cache/clipping-summaries/<id>.json. Hash-check skips clippings
// whose inputs are unchanged.
//
// Usage:
//   node scripts/generate-clipping-summaries.mjs                # all clippings
//   node scripts/generate-clipping-summaries.mjs --limit 5      # first 5
//   node scripts/generate-clipping-summaries.mjs --ids a,b,c    # specific IDs
//   node scripts/generate-clipping-summaries.mjs --force        # ignore hash

import { existsSync, readFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import yaml from 'js-yaml';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';
const PROMPT_VERSION = '2026-05-12-v1';

const CACHE_DIR = resolve('data-cache/clipping-summaries');

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

const SYSTEM_PROMPT = `You are summarising historical newspaper clippings drawn from a private family-history archive. The archive supports a book grounded in primary sources, tracing one family's arc: pre-Famine West Cork (the Beara peninsula and Castletown Berehaven) → Land League-era Ireland → Irish-American emigration to Butte and Anaconda, Montana and Jamestown, Dakota Territory. Most clippings are 19th-century reportage: court reports, mining accidents, obituaries, political listings, the occasional colour piece. Some clippings concern a Murphy, Reynolds, or Kelly directly; many supply context — what a place felt like in 1885, what the strike at the St Lawrence Mine looked like in the next day's paper, the slang one might overhear at a Jamestown restaurant counter.

Your job: produce a short, faithful prose summary the writer can read on the source-detail page and, when useful, paraphrase or quote in the book.

## Output

Return JSON with exactly two fields:

- **summary** — a 2-3 sentence prose summary of the clipping. Faithful to what the newspaper actually reports; no speculation; no editorial framing the source does not itself supply. If the clipping is a brief notice (e.g. an infant's death notice), one full sentence is fine. If the transcription is marked partial or OCR-degraded, summarise only what the available text supports, and end with a short bracketed note such as "[transcription partial]" or "[final column unclear]".

- **key_quotes** — 0 to 3 short verbatim excerpts (each under 30 words) drawn word-for-word from the transcription. Pick phrases that carry the source's voice — striking sentences, vivid imagery, telling formal language, a moment that reads well aloud. Do NOT paraphrase. Do NOT include quotes if nothing in the source stands out; an empty list is better than a forced one. Drop surrounding quote marks; the field is a list of strings.

## Style

- Plain English. Match the dignity of a primary source without imitating Victorian register.
- Name people the way the paper names them, including titles and townland epithets ("Timothy Sullivan of Coulagh", "Mr. Wade, head constable", "Mrs. Reynolds").
- Use dates and place names as printed; do not "convert" historical names.
- Do not moralise. Do not explain the significance of the source for the family — that is the writer's job downstream.
- Do not refer to "the article", "the clipping", "the paper", "the piece", "the reporter", "a local notice", "a follow-up notice", or any other meta phrase that names *what kind of newspaper item this is*. Write as if reporting the events directly.
  - Good: "On December 10th, public works across the Barony of Bere were halted en masse."
  - Good: "Mullane's evening of finger billiards at Murphy's saloon ended with the crowd letting him forfeit the purse for an exhibition."
  - Bad: "The article describes how, on December 10th, public works..."
  - Bad: "The reporter notes that Mullane was quite skilled..."
  - Bad: "A follow-up notice reports that Pat Murphy won judgment..."
  - Exception: when the source's literary form is itself part of the content — a wire-reprinted ode, a named columnist's catalogue of slang, a signed editorial — naming the writer or column is fine, but anchor it to the named subject, not to generic phrases.
- For political delegate lists, mine-accident bulletins, display advertisements, and other procedurally-formatted notices, a short factual summary is preferable to a forced narrative. A display ad for a ball or benefit can be summarised: "Division No. 1 of the AOH announces its annual ball at the Miners' Union Hall on March 18, 1889, to raise funds for a new hall; Patrick J. Murphy sits on the reception committee."
- A single-sentence summary is perfectly acceptable for thin notices. Do not pad.
- Never return placeholder text, instructions, schema field descriptions, or any other meta content as if it were the summary. If the transcription is genuinely too thin to summarise, write a single literal sentence describing what the source is and what little it contains.

## Worked examples

### Example 1 — Land League court appearance (1881)

Input excerpt (transcription, partial):
> Two members of the police force at Castletown, Berehaven, attempted to stop a woman named Reynolds, who was in the act of distributing copies of the suppressed manifesto of the Land League. She refused to be stopped, and walked on, with a small force of constabulary at her heels…

Good output:
\`\`\`json
{
  "summary": "Two policemen at Castletown Berehaven try to stop a woman named Reynolds from distributing copies of the suppressed Land League manifesto. She refuses to halt and walks on, trailed by a small force of constabulary.",
  "key_quotes": [
    "She refused to be stopped, and walked on, with a small force of constabulary at her heels"
  ]
}
\`\`\`

Bad output (editorialised, paraphrases the verbatim):
\`\`\`json
{
  "summary": "A striking moment of Irish female defiance during the Land War, as Mrs Reynolds bravely refuses RIC orders to suppress the Land League's manifesto.",
  "key_quotes": ["Mrs Reynolds bravely refuses"]
}
\`\`\`

### Example 2 — Brief notice (death of an infant)

Input excerpt (transcription, complete):
> Mrs. Patrick Murphy, of West Park street, suffered the loss yesterday afternoon of her infant daughter, aged 3 months. The funeral will take place at 9 o'clock this morning from the family residence.

Good output:
\`\`\`json
{
  "summary": "Mrs. Patrick Murphy of West Park Street loses her three-month-old infant daughter; the funeral is to be held from the family residence the following morning at 9 o'clock.",
  "key_quotes": []
}
\`\`\`

(No quote field — there is nothing in the brief notice that warrants pulling.)

### Example 3 — Procedural / list-format notice

Input excerpt (transcription, complete, partial OCR):
> WARD 1 — The Democratic primaries last evening selected the following as delegates to the county convention: P. J. Murphy, John Sullivan, [illegible], M. Cassidy, Owen Daly…

Good output:
\`\`\`json
{
  "summary": "The Democratic primaries for Ward 1 select delegates to the county convention, among them P. J. Murphy, John Sullivan, M. Cassidy, and Owen Daly. [transcription partial — one name illegible]",
  "key_quotes": []
}
\`\`\`

(One sentence is enough; bracketed note flags the gap.)

## Reminders

- The transcription is verbatim newspaper text and may contain OCR scars, period spelling, and editorial brackets like "[the prisoner]". Trust it as the primary source; do not "correct" it.
- The header lines you receive (date, newspaper, themes, places) are interpretive context written by the archivist. Use them to orient yourself, not to colour the summary.
- If the transcription is genuinely too thin to summarise (e.g. "transcription_status: none" or only a fragment of a headline), return a single sentence noting what little is there, with an empty key_quotes list.`;

// NB: no `description` fields here. The model has been observed
// mirroring schema descriptions verbatim when the input is structurally
// unusual (display ads etc.). All guidance lives in the system prompt.
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    key_quotes: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'key_quotes'],
  additionalProperties: false,
};

// ---- Per-clipping payload ---------------------------------------------

function buildUserMessage(meta, transcription) {
  const src = meta.source || {};
  const lines = [];
  lines.push(`Date: ${src.date ?? 'unknown'}`);
  lines.push(`Newspaper: ${src.newspaper ?? 'unknown'}${src.city ? ` (${src.city})` : ''}`);
  if (src.page != null) lines.push(`Page: ${src.page}`);
  if (meta.source_type?.length) lines.push(`Source type: ${meta.source_type.join(', ')}`);
  if (meta.headline) lines.push(`Headline: ${meta.headline}`);
  if (meta.dateline) lines.push(`Dateline: ${meta.dateline}`);
  if (meta.themes?.length) lines.push(`Themes: ${meta.themes.join(', ')}`);

  const placeNames = (meta.places || []).map(p => p.id?.replace(/^place_/, '').replace(/_/g, ' ')).filter(Boolean);
  if (placeNames.length) lines.push(`Places: ${placeNames.join(', ')}`);

  const peopleNames = [
    ...(meta.people || []).map(p => p.name_as_printed).filter(Boolean),
    ...(meta.mentioned || []).map(m => m.name_as_printed).filter(Boolean),
  ];
  if (peopleNames.length) lines.push(`Named persons: ${peopleNames.join('; ')}`);

  lines.push(`Transcription status: ${meta.transcription_status ?? 'unknown'}${meta.transcription_confidence ? ` (${meta.transcription_confidence} confidence)` : ''}`);
  lines.push('');
  lines.push('--- TRANSCRIPTION ---');
  lines.push(transcription.trim());

  return lines.join('\n');
}

// ---- Hash ---------------------------------------------------------------

function inputHash(meta, transcription) {
  const h = createHash('sha256');
  h.update(`prompt:${PROMPT_VERSION}\n`);
  h.update(`model:${MODEL}\n`);
  h.update(`meta:${JSON.stringify(meta)}\n`);
  h.update(`transcription:${transcription}\n`);
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
    console.error('[generate] ANTHROPIC_API_KEY missing — add it to .env.local');
    process.exit(1);
  }

  const dataRoot = resolveDataRoot();
  const clippingsDir = join(dataRoot, 'archive', 'clippings');
  console.log(`[generate] data root: ${dataRoot}`);
  console.log(`[generate] cache dir: ${CACHE_DIR}`);

  mkdirSync(CACHE_DIR, { recursive: true });

  const allIds = readdirSync(clippingsDir)
    .filter(name => {
      const p = join(clippingsDir, name);
      try { return statSync(p).isDirectory(); } catch { return false; }
    })
    .sort();

  let ids = onlyIds ? allIds.filter(id => onlyIds.has(id)) : allIds;
  if (limit != null) ids = ids.slice(0, limit);

  console.log(`[generate] ${ids.length} clipping(s) selected (of ${allIds.length} total).\n`);

  const client = new Anthropic();
  let generated = 0, skipped = 0, failed = 0;
  const totals = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };

  for (const id of ids) {
    const metaPath = join(clippingsDir, id, 'metadata.yaml');
    const transPath = join(clippingsDir, id, 'transcription.md');
    if (!existsSync(metaPath) || !existsSync(transPath)) {
      console.log(`[skip] ${id}: missing metadata.yaml or transcription.md`);
      skipped++;
      continue;
    }
    const meta = yaml.load(readFileSync(metaPath, 'utf-8'));
    const transcription = readFileSync(transPath, 'utf-8');
    const hash = inputHash(meta, transcription);

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

    const userMessage = buildUserMessage(meta, transcription);
    process.stdout.write(`[gen]  ${id} ... `);

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 800,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        output_config: {
          format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
        },
        messages: [{ role: 'user', content: userMessage }],
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
        key_quotes: parsed.key_quotes,
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
  console.log(`[generate] done. generated=${generated} skipped=${skipped} failed=${failed}`);
  console.log(`[generate] tokens: input=${totals.input} output=${totals.output} cache_create=${totals.cacheCreate} cache_read=${totals.cacheRead}`);
  const costUsd =
    (totals.input * 3) / 1_000_000 +
    (totals.output * 15) / 1_000_000 +
    (totals.cacheCreate * 3.75) / 1_000_000 +
    (totals.cacheRead * 0.3) / 1_000_000;
  console.log(`[generate] est cost: $${costUsd.toFixed(4)} (sonnet 4.6: $3 in / $15 out / $3.75 cache-write / $0.30 cache-read per 1M)`);
}

main().catch(err => { console.error(err); process.exit(1); });
