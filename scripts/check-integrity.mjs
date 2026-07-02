// Referential-integrity gate. Runs in prebuild (after clone-data.mjs)
// and fails the build when the data repo breaks an invariant the app
// links against — the same "fail loudly" philosophy as the duplicate-ID
// guard in lib/data/index.ts, applied to every cross-reference.
//
// ERRORS (exit 1) are ID references the UI turns into links or nodes:
// a regression here means a person/place/theme/thread link that cannot
// resolve. WARNINGS are known-pending workflow states the UI already
// degrades gracefully for (pages not yet archived, PREDICTED crossrefs,
// inbox residence citations) — reported for visibility, never fatal.
//
// Reads the same allowlisted files as lib/data/loader.ts: metadata.yaml,
// page_metadata.yaml, people.yaml, photos.yaml, vocab/*.yaml. Never
// touches notes.md or binaries.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';

// ---- Data-root resolution (mirrors loader.ts + clone-data.mjs) ----------

function loadDotEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const rawLine of readFileSync('.env.local', 'utf-8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]]) continue; // env wins
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

function resolveDataRoot() {
  loadDotEnvLocal();
  if (process.env.NEWSPAPER_DATA_PATH) {
    const r = resolve(process.env.NEWSPAPER_DATA_PATH);
    if (existsSync(join(r, 'archive'))) return r;
    fail(`NEWSPAPER_DATA_PATH=${r} has no archive/ directory`);
  }
  for (const candidate of ['./data', '../project-newspaper-data', '../newspaper']) {
    const r = resolve(process.cwd(), candidate);
    if (existsSync(join(r, 'archive'))) return r;
  }
  fail('Cannot find the newspaper data repo (tried ./data, ../project-newspaper-data, ../newspaper).');
}

function fail(msg) {
  console.error(`[check-integrity] ERROR: ${msg}`);
  process.exit(1);
}

// ---- Load (allowlisted files only) ---------------------------------------

const isDir = p => { try { return statSync(p).isDirectory(); } catch { return false; } };
const listDirs = p => (isDir(p) ? readdirSync(p).filter(n => isDir(join(p, n))) : []);
const readYaml = p => yaml.load(readFileSync(p, 'utf-8'));

const ROOT = join(resolveDataRoot(), 'archive');
console.log(`[check-integrity] scanning ${ROOT}`);

const sources = [];
for (const d of listDirs(join(ROOT, 'clippings'))) {
  const mp = join(ROOT, 'clippings', d, 'metadata.yaml');
  if (!existsSync(mp)) continue;
  const m = readYaml(mp);
  if (m) sources.push({ ...m, id: m.id ?? d, kind: 'clipping' });
}
for (const t of listDirs(join(ROOT, 'documents'))) {
  for (const d of listDirs(join(ROOT, 'documents', t))) {
    const mp = join(ROOT, 'documents', t, d, 'metadata.yaml');
    if (!existsSync(mp)) continue;
    const m = readYaml(mp);
    if (m) sources.push({ ...m, id: m.id ?? d, kind: 'document' });
  }
}

const pages = new Map();
for (const d of listDirs(join(ROOT, 'pages'))) {
  const mp = join(ROOT, 'pages', d, 'page_metadata.yaml');
  if (!existsSync(mp)) continue;
  const m = readYaml(mp);
  if (m) pages.set(m.id ?? d, m);
}

const loadMap = p => (existsSync(p) ? readYaml(p) ?? {} : {});
const people = loadMap(join(ROOT, 'people', 'people.yaml'));
const photos = loadMap(join(ROOT, 'photos', 'photos.yaml'));
const places = loadMap(join(ROOT, 'vocab', 'places.yaml'));
const threads = loadMap(join(ROOT, 'vocab', 'threads.yaml'));
const themesRaw = existsSync(join(ROOT, 'vocab', 'themes.yaml')) ? readYaml(join(ROOT, 'vocab', 'themes.yaml')) : [];

const personIds = new Set(Object.keys(people));
const placeIds = new Set(Object.keys(places));
const threadIds = new Set(Object.keys(threads));
const themeIds = new Set(Array.isArray(themesRaw) ? themesRaw : Object.keys(themesRaw ?? {}));
const sourceIds = new Set();

// ---- Checks ---------------------------------------------------------------

const errors = new Map();   // category -> [detail]
const warnings = new Map();
const err = (cat, detail) => (errors.get(cat) ?? errors.set(cat, []).get(cat)).push(detail);
const warn = (cat, detail) => (warnings.get(cat) ?? warnings.set(cat, []).get(cat)).push(detail);

for (const s of sources) {
  if (sourceIds.has(s.id)) err('duplicate source id', s.id);
  sourceIds.add(s.id);
}

for (const s of sources) {
  const pids = (s.people ?? []).map(p => p?.id).filter(Boolean);
  for (const pid of pids) {
    if (!personIds.has(pid)) err('source.people → unknown person', `${s.id}: ${pid}`);
  }
  for (const dup of new Set(pids.filter((p, i) => pids.indexOf(p) !== i))) {
    err('person listed twice in one source', `${s.id}: ${dup}`);
  }
  for (const p of s.people ?? []) {
    if (p?.id && typeof p.confidence_is_my_family !== 'number') {
      warn('person link missing confidence_is_my_family (renders as 0)', `${s.id}: ${p.id}`);
    }
  }
  for (const pl of s.places ?? []) {
    const id = typeof pl === 'string' ? pl : pl?.id;
    if (id && !placeIds.has(id)) err('source.places → unknown place', `${s.id}: ${id}`);
  }
  for (const t of s.themes ?? []) {
    if (!themeIds.has(t)) err('theme not declared in vocab/themes.yaml', `${s.id}: ${t}`);
  }
  for (const t of s.story_threads ?? []) {
    if (!threadIds.has(t)) err('story_thread not declared in vocab/threads.yaml', `${s.id}: ${t}`);
  }
  // Crossrefs legitimately reference sources OR full pages; anything else
  // is treated as a PREDICTED record still to be filed.
  for (const x of s.crossrefs ?? []) {
    if (!sourceIds.has(x) && !pages.has(x)) {
      warn('crossref unresolved (predicted record?)', `${s.id}: ${x}`);
    }
  }
  if (s.kind === 'clipping' && s.page_id && !pages.has(s.page_id)) {
    warn('clipping.page_id → page not yet archived', `${s.id}: ${s.page_id}`);
  }
}

for (const [pid, p] of Object.entries(people)) {
  for (const r of p?.relationships ?? []) {
    if (!personIds.has(r.person)) err('relationship → unknown person', `${pid}: ${r.relation} ${r.person}`);
  }
  if (p?.primary_residence && !placeIds.has(p.primary_residence)) {
    err('primary_residence → unknown place', `${pid}: ${p.primary_residence}`);
  }
  for (const res of p?.residences ?? []) {
    if (res?.place && !placeIds.has(res.place)) {
      err('residence.place → unknown place', `${pid}: ${res.place}`);
    }
    for (const sid of res?.sources ?? []) {
      if (!sourceIds.has(sid)) warn('residence citation not yet a source (inbox/page?)', `${pid}: ${sid}`);
    }
  }
}

for (const [phid, ph] of Object.entries(photos)) {
  if (ph?.page_id && !pages.has(ph.page_id)) err('photo.page_id → unknown page', `${phid}: ${ph.page_id}`);
  for (const c of ph?.person_candidates ?? []) {
    if (!personIds.has(c.person_id)) err('photo candidate → unknown person', `${phid}: ${c.person_id}`);
  }
  for (const sid of ph?.sources ?? []) {
    if (!sourceIds.has(sid)) err('photo.sources → unknown source', `${phid}: ${sid}`);
  }
}

for (const [pgid, pg] of pages) {
  for (const cid of pg?.clippings ?? []) {
    if (!sourceIds.has(cid)) err('page.clippings → unknown clipping', `${pgid}: ${cid}`);
  }
}

// ---- Report ---------------------------------------------------------------

const show = (map, mark) => {
  for (const [cat, items] of map) {
    console.log(`  ${mark} ${cat} (${items.length})`);
    for (const it of items.slice(0, 10)) console.log(`      ${it}`);
    if (items.length > 10) console.log(`      …and ${items.length - 10} more`);
  }
};

console.log(`[check-integrity] ${sources.length} sources, ${personIds.size} people, ${placeIds.size} places, ${pages.size} pages`);
if (warnings.size > 0) {
  console.log('[check-integrity] warnings (non-fatal — UI degrades gracefully):');
  show(warnings, '⚠');
}
if (errors.size > 0) {
  console.error('[check-integrity] ERRORS — the app would render dead links or drop connections:');
  show(errors, '✗');
  process.exit(1);
}
console.log('[check-integrity] OK — all hard invariants hold.');
