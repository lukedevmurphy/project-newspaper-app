// Extract person-name candidates from full-page transcriptions.
//
// A text-only (cheap) pass over fullpage_transcription.md: Claude lists
// every personal name printed on the page; deterministic JS post-
// processing then cross-checks each against people.yaml (names +
// aliases) and the clippings' mentioned[] lists, and flags watchlist
// surnames. The output is a RESEARCH ARTIFACT for manual curation —
// it is never loaded by the app and never auto-edits data-repo YAML.
//
// This is the "Murphy mentions you haven't clipped yet" surface.
//
// Usage:
//   node scripts/extract-name-candidates.mjs                 # all pages with transcriptions
//   node scripts/extract-name-candidates.mjs --limit 5
//   node scripts/extract-name-candidates.mjs --ids a,b,c
//   node scripts/extract-name-candidates.mjs --force
//   node scripts/extract-name-candidates.mjs --watch "Murphy,Lyne,Kelly"
//
// Outputs:
//   data-cache/name-candidates/<page_id>.json   (per page)
//   data-cache/name-candidates/REPORT.md        (aggregated, regenerated each run)

import { existsSync, readFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import yaml from 'js-yaml';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';
const PROMPT_VERSION = '2026-06-12-v1';
const CACHE_DIR = resolve('data-cache/name-candidates');

const DEFAULT_WATCHLIST = ['Murphy', 'Lyne', 'Lynn', 'Kelly', 'Sullivan', 'Maloughney', 'Maloney', 'Shea', 'Harrington', 'Gallagher', 'Softley'];

// ---- .env.local + data-root (house conventions) -------------------------

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

// ---- Prompt -----------------------------------------------------------------

const SYSTEM_PROMPT = `You are indexing personal names from verbatim transcriptions of historical newspaper pages (19th/early-20th-century US/UK/Irish press) for a family-history research archive.

You receive the full markdown transcription of ONE page. List every PERSONAL NAME printed on the page.

Rules:
- Include every person named in news items, court columns, social notes, death/birth/marriage notices, sports rosters, committee lists, and classifieds signed by a person.
- name_as_printed: the name exactly as printed (preserve initials, "Mrs.", abbreviations like "Jas.", "Wm.").
- context_quote: a short verbatim phrase (under 20 words) around the name, enough to relocate it on the page.
- role_hint: 2-6 words on who/what they are in that item (e.g. "deceased miner", "wedding witness", "AOH committee member", "advertiser").
- column: which "## Column N" section of the transcription the name appears in, as printed in the markdown (e.g. "Column 3"); use "unknown" if the transcription has no column headings.
- Exclude: business names with no personal name, public figures named only in wire-service datelines (presidents, monarchs) UNLESS the item is about them locally, and saints/ships/street names.
- Names marked [word?] or partly illegible: include them, keep the brackets.
- De-duplicate within the page: one entry per distinct person per page (first occurrence's context).`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    names: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name_as_printed: { type: 'string' },
          context_quote: { type: 'string' },
          role_hint: { type: 'string' },
          column: { type: 'string' },
        },
        required: ['name_as_printed', 'context_quote', 'role_hint', 'column'],
        additionalProperties: false,
      },
    },
  },
  required: ['names'],
  additionalProperties: false,
};

// ---- Cross-check data --------------------------------------------------------

function loadKnownNames(dataRoot) {
  const known = new Map(); // lowercase name → person_id
  const peoplePath = join(dataRoot, 'archive', 'people', 'people.yaml');
  if (existsSync(peoplePath)) {
    const people = yaml.load(readFileSync(peoplePath, 'utf-8')) ?? {};
    for (const [id, p] of Object.entries(people)) {
      if (p?.display_name) known.set(normalizeName(p.display_name.split('(')[0]), id);
      for (const aka of p?.also_known_as ?? []) known.set(normalizeName(aka), id);
    }
  }
  return known;
}

function loadMentionedNames(dataRoot) {
  const mentioned = new Map(); // lowercase name → [clipping ids]
  const clippingsDir = join(dataRoot, 'archive', 'clippings');
  if (!existsSync(clippingsDir)) return mentioned;
  for (const dir of readdirSync(clippingsDir)) {
    const metaPath = join(clippingsDir, dir, 'metadata.yaml');
    if (!existsSync(metaPath)) continue;
    let meta;
    try { meta = yaml.load(readFileSync(metaPath, 'utf-8')); } catch { continue; }
    for (const m of meta?.mentioned ?? []) {
      if (!m?.name_as_printed) continue;
      const key = normalizeName(m.name_as_printed);
      const list = mentioned.get(key) ?? [];
      list.push(meta.id ?? dir);
      mentioned.set(key, list);
    }
    for (const p of meta?.people ?? []) {
      if (!p?.name_as_printed) continue;
      const key = normalizeName(p.name_as_printed);
      const list = mentioned.get(key) ?? [];
      list.push(meta.id ?? dir);
      mentioned.set(key, list);
    }
  }
  return mentioned;
}

function normalizeName(s) {
  return s.toLowerCase().replace(/[.,'"]/g, '').replace(/\s+/g, ' ').trim();
}

function surnameOf(nameAsPrinted) {
  // "Murphy Jas J" (directory order) and "James J. Murphy" both need
  // handling; take the longest capitalised token as the best guess.
  const tokens = nameAsPrinted.replace(/[[\]?]/g, '').split(/\s+/).filter(t => /^[A-Z]/.test(t));
  if (tokens.length === 0) return '';
  return tokens.reduce((a, b) => (b.replace(/\W/g, '').length >= a.replace(/\W/g, '').length ? b : a)).replace(/\W/g, '');
}

// ---- Main --------------------------------------------------------------------

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
    console.error('[names] ANTHROPIC_API_KEY missing — add it to .env.local');
    process.exit(1);
  }

  const dataRoot = resolveDataRoot();
  const pagesDir = join(dataRoot, 'archive', 'pages');
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`[names] data root: ${dataRoot}`);
  console.log(`[names] watchlist: ${watchlist.join(', ')}`);

  const knownNames = loadKnownNames(dataRoot);
  const mentionedNames = loadMentionedNames(dataRoot);

  const allIds = readdirSync(pagesDir)
    .filter(name => {
      try { return statSync(join(pagesDir, name)).isDirectory(); } catch { return false; }
    })
    .filter(name => existsSync(join(pagesDir, name, 'fullpage_transcription.md')))
    .sort();
  let ids = onlyIds ? allIds.filter(id => onlyIds.has(id)) : allIds;
  if (limit != null) ids = ids.slice(0, limit);
  console.log(`[names] ${ids.length} page(s) selected (of ${allIds.length} with transcriptions).\n`);

  const client = new Anthropic();
  let generated = 0, skipped = 0, failed = 0;
  const totals = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };

  for (const id of ids) {
    const text = readFileSync(join(pagesDir, id, 'fullpage_transcription.md'), 'utf-8');
    const hash = `sha256:${createHash('sha256').update(`${PROMPT_VERSION}\n${MODEL}\n${text}`).digest('hex').slice(0, 16)}`;
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

    process.stdout.write(`[gen]  ${id} ... `);
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        messages: [{ role: 'user', content: [{ type: 'text', text }] }],
      });
      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock) throw new Error('no text block in response');
      const parsed = JSON.parse(textBlock.text);

      const names = parsed.names.map(n => {
        const key = normalizeName(n.name_as_printed);
        const surname = surnameOf(n.name_as_printed).toLowerCase();
        return {
          ...n,
          watchlist_surname: watchlist.includes(surname) ? surname : null,
          known_person_id: knownNames.get(key) ?? null,
          already_mentioned_in: mentionedNames.get(key) ?? [],
        };
      });

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
        names,
      }, null, 2));
      console.log(`ok (${names.length} names)`);
      generated++;
    } catch (err) {
      console.log(`FAIL — ${err.message}`);
      failed++;
    }
  }

  // ---- Aggregated report (regenerated over the whole cache) ---------------
  writeReport(watchlist);

  console.log('');
  console.log(`[names] done. generated=${generated} skipped=${skipped} failed=${failed}`);
  console.log(`[names] tokens: input=${totals.input} output=${totals.output} cache_create=${totals.cacheCreate} cache_read=${totals.cacheRead}`);
  const costUsd =
    (totals.input * 3) / 1_000_000 +
    (totals.output * 15) / 1_000_000 +
    (totals.cacheCreate * 3.75) / 1_000_000 +
    (totals.cacheRead * 0.3) / 1_000_000;
  console.log(`[names] est cost: $${costUsd.toFixed(4)}`);
  console.log(`[names] report: ${join(CACHE_DIR, 'REPORT.md')}`);
}

function writeReport(watchlist) {
  const watchHits = [];
  const knownHits = [];
  let pageCount = 0, nameCount = 0;

  for (const file of readdirSync(CACHE_DIR).filter(f => f.endsWith('.json')).sort()) {
    let record;
    try { record = JSON.parse(readFileSync(join(CACHE_DIR, file), 'utf-8')); } catch { continue; }
    pageCount++;
    for (const n of record.names ?? []) {
      nameCount++;
      if (n.watchlist_surname && n.already_mentioned_in.length === 0 && !n.known_person_id) {
        watchHits.push({ page: record.id, ...n });
      } else if (n.known_person_id) {
        knownHits.push({ page: record.id, ...n });
      }
    }
  }

  const lines = [
    '# Name-candidate report',
    '',
    `Generated ${new Date().toISOString()} over ${pageCount} pages (${nameCount} names extracted).`,
    `Watchlist: ${watchlist.join(', ')}.`,
    '',
    'This is a research artifact for manual curation — review against the page',
    'image, then add worthwhile names to the relevant metadata.yaml `mentioned:`',
    'list (or people.yaml) in the data repo by hand. Nothing here reaches the app.',
    '',
    `## Watchlist surnames not yet recorded anywhere (${watchHits.length})`,
    '',
  ];
  for (const h of watchHits) {
    lines.push(`- **${h.name_as_printed}** (${h.role_hint}) — ${h.page}, ${h.column}`);
    lines.push(`  > ${h.context_quote}`);
  }
  lines.push('', `## Names matching existing people records (${knownHits.length})`, '');
  for (const h of knownHits) {
    lines.push(`- ${h.name_as_printed} → \`${h.known_person_id}\` — ${h.page}, ${h.column} (${h.role_hint})`);
  }
  lines.push('');
  writeFileSync(join(CACHE_DIR, 'REPORT.md'), lines.join('\n'));
}

main().catch(err => { console.error(err); process.exit(1); });
