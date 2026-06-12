// Full-page verbatim transcriptions for the data repo.
//
// Unlike the summaries scripts (which cache JSON in this repo), the
// output here is SOURCE MATERIAL: a canonical, human-correctable
// fullpage_transcription.md written next to page_metadata.yaml in the
// data repo. The front-matter carries provenance + a status field; a
// file marked `transcription_status: human_corrected` is never
// overwritten (even --force; requires --overwrite-corrected).
//
// Usage:
//   node scripts/generate-page-transcriptions.mjs --adopt        # wrap the existing
//       transcription_claude.md files in the new front-matter, zero API cost
//   node scripts/generate-page-transcriptions.mjs                # transcribe pages with no file yet
//   node scripts/generate-page-transcriptions.mjs --limit 3
//   node scripts/generate-page-transcriptions.mjs --ids a,b,c
//   node scripts/generate-page-transcriptions.mjs --force        # re-transcribe (not human_corrected)
//   node scripts/generate-page-transcriptions.mjs --overwrite-corrected --ids x  # loud override
//
// The input_hash covers the IMAGE BYTES only (not metadata, not the
// prompt) — metadata edits must never trigger a ~$0.30 re-transcription.
// Prompt/model changes are picked up explicitly via --force.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import yaml from 'js-yaml';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-4-8';
const PROMPT_VERSION = '2026-06-12-v1';
const MAX_TOKENS = 32000;
const MAX_CONTINUATIONS = 2;

// Anthropic's per-image cap is 5 MB base64 → ~3.6 MB raw with margin.
const MAX_IMAGE_BYTES = Math.floor(5 * 1024 * 1024 * 3 / 4) - 64 * 1024;
// Opus 4.7+ accepts up to ~2576px on the long edge at full resolution —
// keep every pixel of that budget; dense body type needs it.
const LONG_EDGE = 2576;

async function fitForApi(buffer) {
  for (const q of [88, 80, 70, 60, 50]) {
    const resized = await sharp(buffer)
      .rotate()
      .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
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

// ---- .env.local loader (mirrors generate-page-summaries.mjs) ------------

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

// ---- Prompt — adapted from the proven archive/scripts/transcribe_jpg.py --

const SYSTEM_PROMPT = `You are transcribing a high-resolution scan of a historical newspaper page (19th- or early-20th-century US/UK/Irish press) for a primary-source research archive.

Your output is read against the image and quoted in a book. Accuracy and faithfulness to the source matter more than readability.

# Rules

1. **Verbatim.** Reproduce the printed text exactly: original spelling, punctuation, capitalisation, hyphenation, line-end em-dashes. Do not modernise. Do not silently correct OCR-style errors that are actually in the printed page.

2. **Mark uncertainty.** When a word is partly illegible, render it as \`[word?]\` with the best guess. When several words are gone, render \`[illegible]\` or \`[illegible — N words]\`. Never invent text to bridge a gap.

3. **Editor's marks only.** Square brackets \`[ ]\` are reserved for your editorial marks (uncertainty, line breaks in poetry, page-fold notes). They are never used to paraphrase or summarise.

4. **Preserve layout.** Multi-column pages: transcribe column by column, left to right, with a heading \`## Column N\` before each. Within a column, preserve paragraph breaks. Headlines and subheads get markdown heading levels (\`#\` for main display head, \`##\` for decks, \`###\` for kickers/subheads). Italic display type is rendered with \`*asterisks*\`.

5. **Start with the masthead line.** Open the body with a single \`#\` heading reproducing the masthead/date line as printed (e.g. \`# THE TIMES, THURSDAY, DECEMBER 31, 1846.\`). Do NOT emit your own YAML front-matter — the harness adds provenance front-matter itself.

6. **Catalogue peripheral content.** After the main article(s), add a \`## Peripheral items\` section listing every ad, classified, masthead element, and unrelated short item on the page with a one-line description each. This is the "what else was on this page" context for the archive.

7. **Do not editorialise.** No commentary, no historical context, no "this is interesting because...". Just the transcription and the peripheral catalogue.

8. **OCR is not your starting point.** You are reading the image directly. Treat any OCR text layer as untrusted — the printed image is authoritative.

9. **Use markdown.** No code fences around the whole response.`;

// ---- Front-matter helpers -------------------------------------------------

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseFrontMatter(text) {
  const m = text.match(FM_RE);
  if (!m) return { fm: null, body: text };
  let fm = null;
  try {
    fm = yaml.load(m[1]);
  } catch {
    fm = null;
  }
  return { fm, body: text.slice(m[0].length) };
}

function buildFrontMatter(fields) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    lines.push(`${k}: ${String(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function imageHash(imageBytes) {
  return `sha256:${createHash('sha256').update(imageBytes).digest('hex').slice(0, 16)}`;
}

// ---- Generation ------------------------------------------------------------

async function transcribePage(client, imageB64, onChunk) {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageB64 } },
        { type: 'text', text: 'Transcribe this newspaper page in full per the rules in the system prompt.' },
      ],
    },
  ];

  let combined = '';
  let truncated = false;
  const usageTotals = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    });
    let chunkCount = 0;
    stream.on('text', () => {
      chunkCount++;
      if (chunkCount % 200 === 0) onChunk?.();
    });
    const final = await stream.finalMessage();

    const text = final.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
    combined += text;
    usageTotals.input += final.usage.input_tokens ?? 0;
    usageTotals.output += final.usage.output_tokens ?? 0;
    usageTotals.cacheCreate += final.usage.cache_creation_input_tokens ?? 0;
    usageTotals.cacheRead += final.usage.cache_read_input_tokens ?? 0;

    if (final.stop_reason === 'refusal') throw new Error('model refused the request');
    if (final.stop_reason !== 'max_tokens') {
      truncated = false;
      break;
    }
    truncated = true;
    if (attempt === MAX_CONTINUATIONS) break;
    messages.push({ role: 'assistant', content: text });
    messages.push({
      role: 'user',
      content: 'Continue the transcription exactly where you stopped. Do not repeat any text already transcribed; do not add any preamble.',
    });
  }

  return { text: combined.trim() + '\n', truncated, usage: usageTotals };
}

// ---- Main -------------------------------------------------------------------

async function main() {
  loadDotEnvLocal();

  const { values } = parseArgs({
    options: {
      adopt: { type: 'boolean', default: false },
      limit: { type: 'string' },
      ids: { type: 'string' },
      force: { type: 'boolean', default: false },
      'overwrite-corrected': { type: 'boolean', default: false },
    },
  });
  const limit = values.limit ? parseInt(values.limit, 10) : null;
  const onlyIds = values.ids ? new Set(values.ids.split(',').map(s => s.trim())) : null;
  const force = values.force;
  const overwriteCorrected = values['overwrite-corrected'];

  const dataRoot = resolveDataRoot();
  const pagesDir = join(dataRoot, 'archive', 'pages');
  console.log(`[transcribe] data root: ${dataRoot}`);
  console.log(`[transcribe] mode: ${values.adopt ? 'ADOPT existing transcription_claude.md' : 'generate'}`);

  const allIds = readdirSync(pagesDir)
    .filter(name => {
      try { return statSync(join(pagesDir, name)).isDirectory(); } catch { return false; }
    })
    .sort();
  let ids = onlyIds ? allIds.filter(id => onlyIds.has(id)) : allIds;
  if (limit != null) ids = ids.slice(0, limit);
  console.log(`[transcribe] ${ids.length} page(s) selected (of ${allIds.length} total).\n`);

  let done = 0, skipped = 0, failed = 0;
  const totals = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
  let client = null;

  for (const id of ids) {
    const dir = join(pagesDir, id);
    const outPath = join(dir, 'fullpage_transcription.md');
    const imagePath = join(dir, 'fullpage.jpg');

    // The human-corrected guard — the most important line in the script.
    if (existsSync(outPath)) {
      const { fm } = parseFrontMatter(readFileSync(outPath, 'utf-8'));
      if (fm?.transcription_status === 'human_corrected' && !overwriteCorrected) {
        console.log(`[skip] ${id}: human_corrected — never overwritten without --overwrite-corrected`);
        skipped++;
        continue;
      }
      if (fm?.transcription_status === 'human_corrected' && overwriteCorrected) {
        console.log(`[WARN] ${id}: OVERWRITING a human-corrected transcription (--overwrite-corrected)`);
      }
    }

    if (!existsSync(imagePath)) {
      console.log(`[skip] ${id}: no fullpage.jpg`);
      skipped++;
      continue;
    }
    const imageBytes = readFileSync(imagePath);
    const hash = imageHash(imageBytes);

    if (!force && existsSync(outPath)) {
      const { fm } = parseFrontMatter(readFileSync(outPath, 'utf-8'));
      if (fm?.input_hash === hash) {
        console.log(`[skip] ${id}: image hash match`);
        skipped++;
        continue;
      }
    }

    if (values.adopt) {
      const legacyPath = join(dir, 'transcription_claude.md');
      if (!existsSync(legacyPath)) {
        console.log(`[skip] ${id}: no transcription_claude.md to adopt`);
        skipped++;
        continue;
      }
      const { body } = parseFrontMatter(readFileSync(legacyPath, 'utf-8'));
      const fm = buildFrontMatter({
        page_id: id,
        transcription_status: 'ai_generated',
        model: 'claude-opus-4-7',          // what actually generated these (transcribe_jpg.py)
        prompt_version: 'adopted-pre-2026-06',
        generated_at: new Date().toISOString(),
        input_hash: hash,
      });
      writeFileSync(outPath, fm + body.trimStart());
      console.log(`[adopt] ${id}`);
      done++;
      continue;
    }

    // ---- Live generation ----
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[transcribe] ANTHROPIC_API_KEY missing — add it to .env.local');
      process.exit(1);
    }
    client ??= new Anthropic();

    const sendBytes = await fitForApi(imageBytes);
    process.stdout.write(
      `[gen]  ${id} (${(imageBytes.length / 1024 / 1024).toFixed(1)}MB → ${(sendBytes.length / 1024 / 1024).toFixed(1)}MB) `
    );
    try {
      const { text, truncated, usage } = await transcribePage(
        client,
        sendBytes.toString('base64'),
        () => process.stdout.write('.')
      );
      totals.input += usage.input;
      totals.output += usage.output;
      totals.cacheCreate += usage.cacheCreate;
      totals.cacheRead += usage.cacheRead;

      const fm = buildFrontMatter({
        page_id: id,
        transcription_status: truncated ? 'ai_truncated' : 'ai_generated',
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        generated_at: new Date().toISOString(),
        input_hash: hash,
      });
      writeFileSync(outPath, fm + text);
      console.log(` ok${truncated ? ' (TRUNCATED after continuations)' : ''} (in=${usage.input}, out=${usage.output})`);
      done++;
    } catch (err) {
      console.log(` FAIL — ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`[transcribe] done. written=${done} skipped=${skipped} failed=${failed}`);
  if (totals.input + totals.output > 0) {
    console.log(`[transcribe] tokens: input=${totals.input} output=${totals.output} cache_create=${totals.cacheCreate} cache_read=${totals.cacheRead}`);
    const costUsd =
      (totals.input * 5) / 1_000_000 +
      (totals.output * 25) / 1_000_000 +
      (totals.cacheCreate * 6.25) / 1_000_000 +
      (totals.cacheRead * 0.5) / 1_000_000;
    console.log(`[transcribe] est cost: $${costUsd.toFixed(4)} (opus 4.8: $5 in / $25 out / $6.25 cache-write / $0.50 cache-read per 1M)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
