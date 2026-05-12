// Sanity-check the data-loading layer. Reads the archive, prints a
// summary to stdout. Run with:
//   NEWSPAPER_DATA_PATH=../newspaper npx tsx scripts/print-index-summary.ts

import { loadArchive } from '../lib/data';

const archive = loadArchive();
const s = archive.stats;

console.log('=== Archive index summary ===\n');

console.log(`Sources: ${s.totalSources}`);
for (const [type, count] of Object.entries(s.sourcesByType)) {
  console.log(`  ${type}: ${count}`);
}
console.log(`Date range: ${s.dateRange.earliest ?? '?'}  →  ${s.dateRange.latest ?? '?'}`);
console.log('');

console.log(`Pages: ${s.totalPages}`);
console.log('');

console.log(`People (${s.totalPeople}) by family_confidence band:`);
console.log(`  >=95: ${s.peopleByConfidenceBand.gte95}`);
console.log(`  75-94: ${s.peopleByConfidenceBand.band75to94}`);
console.log(`  25-74: ${s.peopleByConfidenceBand.band25to74}`);
console.log(`  10-24: ${s.peopleByConfidenceBand.band10to24}`);
console.log(`   0:   ${s.peopleByConfidenceBand.zero}`);
console.log('');

console.log('Vocab usage:');
for (const [name, u] of Object.entries(s.vocabUsage)) {
  const tag = u.orphan > 0 ? ' (ORPHAN!)' : '';
  console.log(`  ${name.padEnd(12)} declared ${String(u.declared).padStart(3)}, used ${String(u.used).padStart(3)}, unused ${String(u.unused).padStart(3)}, orphan ${u.orphan}${tag}`);
}
console.log('');

// Top people by source count
const peopleSorted = [...archive.peopleById.entries()]
  .map(([id, p]) => ({
    id,
    name: p.display_name,
    count: archive.sourcesByPersonId.get(id)?.length ?? 0,
    conf: p.family_confidence,
  }))
  .filter(x => x.count > 0)
  .sort((a, b) => b.count - a.count);

console.log('Top people by source count:');
for (const p of peopleSorted.slice(0, 12)) {
  console.log(`  ${String(p.count).padStart(2)}x  [conf ${String(p.conf).padStart(3)}]  ${p.name.padEnd(48)} (${p.id})`);
}
console.log('');

// Top places
const placesSorted = [...archive.placesById.entries()]
  .map(([id, p]) => ({
    id,
    display: p.display,
    count: archive.sourcesByPlaceId.get(id)?.length ?? 0,
  }))
  .filter(x => x.count > 0)
  .sort((a, b) => b.count - a.count);

console.log('Top places by source count:');
for (const p of placesSorted.slice(0, 12)) {
  console.log(`  ${String(p.count).padStart(2)}x  ${p.display.padEnd(40)} (${p.id})`);
}
console.log('');

// Top themes
const themesSorted = archive.themes
  .map(t => ({ t, count: archive.sourcesByTheme.get(t)?.length ?? 0 }))
  .filter(x => x.count > 0)
  .sort((a, b) => b.count - a.count);

console.log('Top themes by source count:');
for (const t of themesSorted.slice(0, 12)) {
  console.log(`  ${String(t.count).padStart(2)}x  ${t.t}`);
}
console.log('');

// Threads with counts
console.log('Story threads:');
for (const thread of archive.threads) {
  const count = archive.sourcesByThread.get(thread.id)?.length ?? 0;
  console.log(`  ${String(count).padStart(2)}x  ${thread.display.padEnd(40)} (${thread.id})`);
}
console.log('');

// Sample sources
console.log('=== First 3 sources (sanity check) ===\n');
for (const src of archive.sources.slice(0, 3)) {
  if (src.type === 'clipping') {
    console.log(`[${src.date}] ${src.newspaper}, p.${src.page}`);
    console.log(`  id: ${src.id}`);
    console.log(`  headline: ${src.headline || '(none)'}`);
    console.log(`  summary: ${src.summary.replace(/\s+/g, ' ').slice(0, 120)}${src.summary.length > 120 ? '...' : ''}`);
    console.log(`  people: ${src.people.length}, mentioned: ${src.mentioned.length}, places: ${src.places.length}, themes: ${src.themes.length}, threads: ${src.story_threads.length}`);
    console.log(`  transcription: ${src.transcription.length} chars (${src.transcription_status})`);
    console.log('');
  }
}

console.log('Done.');
