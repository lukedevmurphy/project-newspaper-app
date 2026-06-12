// Chapter derivation for /story storyboards. Pure data assembly — no
// fs, no React, no AI. A life is segmented into chapters from the
// person's citation-backed residences[] (merge consecutive same-place
// stays, insert gap chapters for multi-year holes, clamp open ends to
// neighbors/birth/death); when residences are absent the fallback is
// decade buckets over the person's dated sources. Every number the UI
// shows must come from a concrete ID array in this output — the
// attribution rule.
//
// Chapter ids are deterministic from the data: they are the cache key
// for future per-chapter AI narratives (data-cache/story-chapters/).
// Changing the slug scheme orphans that cache.

import type { Archive, PersonRecord, Residence } from '@/lib/data';
import { decimalYear } from '@/lib/timeline/positioning';
import { EXTERNAL_CONTEXT, type ExternalContextPeriod } from '@/lib/timeline/external-context';

export interface AddressStanza {
  address?: string;
  from: string | null;        // verbatim from YAML ("c.1904") for display
  to: string | null;
  sourceIds: string[];
  confidence: number;
  notes?: string;
}

export interface ChapterCoOccurrence {
  personId: string;
  relation?: string;          // from the subject's resolved relationships, when present
  sourceIds: string[];
}

export interface StoryChapter {
  id: string;
  index: number;
  kind: 'residence' | 'gap' | 'decade' | 'posthumous' | 'undated';
  title: string;
  placeIds: string[];
  // Display window: verbatim-ish strings plus clamped flags so the UI
  // can say "by 1904" / "until at least 1908" instead of hard dates.
  window: { from: string | null; to: string | null; fromClamped: boolean; toClamped: boolean };
  // Numeric bounds actually used for source assignment (clamped to
  // neighbors/midpoints) — context overlap uses these, not the display
  // strings, so an unknown display bound doesn't match every era.
  windowNum: { start: number | null; end: number | null };
  addressStanzas: AddressStanza[];
  residenceSourceIds: string[];   // citations establishing the chapter frame itself
  sourceGroups: Array<{ clusterId: string; sourceIds: string[] }>;
  context: ExternalContextPeriod[];
  coOccurrences: ChapterCoOccurrence[];
}

// Residence dates carry approximation prefixes ("c.1904", "~1885").
function cleanDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const stripped = d.trim().replace(/^[~]|^c\.?\s*/i, '');
  return /^\d{4}/.test(stripped) ? stripped : null;
}

function num(d: string | null | undefined): number | null {
  return decimalYear(cleanDate(d));
}

const GAP_YEARS = 2;          // holes longer than this become gap chapters
const DECADE_MIN_SOURCES = 3; // decade buckets thinner than this merge into a neighbor

export function deriveChapters(archive: Archive, person: PersonRecord): StoryChapter[] {
  const birthNum = num(person.birth.date);
  const deathNum = num(person.death.date);

  const sourceIds = archive.sourcesByPersonId.get(person.id) ?? [];
  const dated: Array<{ id: string; t: number }> = [];
  const undatedIds: string[] = [];
  for (const sid of sourceIds) {
    const t = num(archive.sourcesById.get(sid)?.date);
    if (t === null) undatedIds.push(sid);
    else dated.push({ id: sid, t });
  }
  dated.sort((a, b) => a.t - b.t);

  const residences = (person.residences ?? []).filter(r => r.place);
  const spine = residences.length > 0
    ? residenceSpine(residences, person, archive, birthNum)
    : decadeSpine(dated, person, archive, deathNum);

  // ---- Assign dated sources to chapters --------------------------------
  // Assignment boundaries: each spine chapter gets [startNum, endNum);
  // unknown internal boundaries fall back to the midpoint of the nearest
  // known bounds (deterministic, surfaced to the reader as clamped
  // wording, never as a hard date).
  const inLife = deathNum === null ? dated : dated.filter(d => d.t <= deathNum + 0.003);
  const posthumousIds = deathNum === null ? [] : dated.filter(d => d.t > deathNum + 0.003).map(d => d.id);

  assignToSpine(spine, inLife);

  const chapters: StoryChapter[] = [...spine.map(s => s.chapter)];

  if (posthumousIds.length > 0) {
    chapters.push(makeChapter({
      kind: 'posthumous',
      title: 'Afterward',
      window: { from: person.death.date, to: null, fromClamped: false, toClamped: false },
      assignedIds: posthumousIds,
    }));
  }
  if (undatedIds.length > 0) {
    chapters.push(makeChapter({
      kind: 'undated',
      title: 'Undated sources',
      window: { from: null, to: null, fromClamped: false, toClamped: false },
      assignedIds: undatedIds,
    }));
  }

  // Carry the numeric assignment bounds onto the chapters before the
  // spine entries go out of scope.
  for (const entry of spine) {
    entry.chapter.windowNum = { start: entry.startNum, end: entry.endNum };
  }

  // ---- Finish each chapter: ids, cluster groups, context, co-occurrence
  chapters.forEach((ch, i) => {
    ch.index = i;
    ch.id = chapterSlug(ch, i);
    ch.sourceGroups = clusterGroups(archive, ch.sourceGroups.flatMap(g => g.sourceIds));
    ch.context = ch.kind === 'posthumous' || ch.kind === 'undated' ? [] : overlappingContext(ch);
    ch.coOccurrences = chapterCoOccurrences(archive, person, ch);
  });

  return chapters;
}

// ---- Residence spine ------------------------------------------------------

interface SpineEntry {
  chapter: StoryChapter;
  startNum: number | null;
  endNum: number | null;
}

function residenceSpine(
  residences: Residence[],
  person: PersonRecord,
  archive: Archive,
  birthNum: number | null
): SpineEntry[] {
  // Sort by best-known anchor (from, else to) — residences with no
  // dates at all keep their YAML order at the end.
  const sorted = [...residences].sort((a, b) => {
    const ka = num(a.date_range.from) ?? (num(a.date_range.to) ?? Infinity) - 0.001;
    const kb = num(b.date_range.from) ?? (num(b.date_range.to) ?? Infinity) - 0.001;
    return ka - kb;
  });

  // Merge consecutive same-place stays into one chapter; each stay
  // becomes an address stanza inside it.
  const merged: Array<{ place: string; stays: Residence[] }> = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.place === r.place) last.stays.push(r);
    else merged.push({ place: r.place, stays: [r] });
  }

  const entries: SpineEntry[] = merged.map((m, i) => {
    const first = m.stays[0];
    const last = m.stays[m.stays.length - 1];
    const fromRaw = first.date_range.from;
    const toRaw = last.date_range.to;
    const place = archive.placesById.get(m.place);
    const chapter = makeChapter({
      kind: 'residence',
      title: place?.display ?? m.place,
      placeIds: [m.place],
      window: {
        from: fromRaw,
        to: toRaw,
        fromClamped: !fromRaw && !(i === 0 && person.birth.date),
        toClamped: !toRaw,
      },
      addressStanzas: m.stays.map(s => ({
        address: s.address,
        from: s.date_range.from,
        to: s.date_range.to,
        sourceIds: s.sources,
        confidence: s.confidence,
        notes: s.notes,
      })),
      residenceSourceIds: [...new Set(m.stays.flatMap(s => s.sources))],
    });
    if (i === 0 && !fromRaw && person.birth.date) chapter.window.from = person.birth.date;
    return { chapter, startNum: num(chapter.window.from), endNum: num(toRaw) };
  });

  // Clamp open numeric ends to neighbors (for assignment); first start
  // falls back to birth.
  if (entries.length > 0 && entries[0].startNum === null) entries[0].startNum = birthNum;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].startNum === null && i > 0) entries[i].startNum = entries[i - 1].endNum;
    if (entries[i].endNum === null && i < entries.length - 1) {
      entries[i].endNum = num(entries[i + 1].chapter.window.from);
    }
  }
  // Remaining unknown internal boundaries: midpoint of nearest known bounds.
  for (let i = 0; i < entries.length - 1; i++) {
    if (entries[i].endNum === null) {
      const prevKnown = entries[i].startNum;
      const nextKnown = entries[i + 1].endNum ?? entries[i + 1].startNum;
      if (prevKnown !== null && nextKnown !== null) {
        entries[i].endNum = (prevKnown + nextKnown) / 2;
        entries[i + 1].startNum = entries[i].endNum;
      }
    } else if (entries[i + 1].startNum === null) {
      entries[i + 1].startNum = entries[i].endNum;
    }
  }

  // Insert gap chapters where consecutive known boundaries leave a hole.
  const withGaps: SpineEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    withGaps.push(entries[i]);
    const next = entries[i + 1];
    if (!next) continue;
    const end = num(entries[i].chapter.window.to);
    const start = num(next.chapter.window.from);
    if (end !== null && start !== null && start - end > GAP_YEARS) {
      withGaps.push({
        chapter: makeChapter({
          kind: 'gap',
          title: 'Between places',
          window: {
            from: entries[i].chapter.window.to,
            to: next.chapter.window.from,
            fromClamped: true,
            toClamped: true,
          },
        }),
        startNum: end,
        endNum: start,
      });
    }
  }
  return withGaps;
}

// ---- Decade fallback ------------------------------------------------------

function decadeSpine(
  dated: Array<{ id: string; t: number }>,
  person: PersonRecord,
  archive: Archive,
  deathNum: number | null
): SpineEntry[] {
  const inLife = deathNum === null ? dated : dated.filter(d => d.t <= deathNum + 0.003);
  if (inLife.length === 0) return [];

  const buckets = new Map<number, string[]>();
  for (const d of inLife) {
    const decade = Math.floor(d.t / 10) * 10;
    const list = buckets.get(decade) ?? [];
    list.push(d.id);
    buckets.set(decade, list);
  }
  let ordered = [...buckets.entries()].sort((a, b) => a[0] - b[0]);

  // Merge thin buckets into the previous (else next) neighbor so the
  // storyboard doesn't fragment into one-source chapters.
  const mergedBuckets: Array<{ decades: number[]; ids: string[] }> = [];
  for (const [decade, ids] of ordered) {
    const prev = mergedBuckets[mergedBuckets.length - 1];
    if (ids.length < DECADE_MIN_SOURCES && prev) {
      prev.decades.push(decade);
      prev.ids.push(...ids);
    } else {
      mergedBuckets.push({ decades: [decade], ids: [...ids] });
    }
  }
  if (mergedBuckets.length >= 2 && mergedBuckets[0].ids.length < DECADE_MIN_SOURCES) {
    mergedBuckets[1].decades.unshift(...mergedBuckets[0].decades);
    mergedBuckets[1].ids.unshift(...mergedBuckets[0].ids);
    mergedBuckets.shift();
  }

  return mergedBuckets.map(b => {
    const firstDecade = Math.min(...b.decades);
    const lastDecade = Math.max(...b.decades);
    const label = firstDecade === lastDecade ? `${firstDecade}s` : `${firstDecade}s–${lastDecade}s`;
    // Dominant places, computed from the bucket's sources — a claim
    // backed by exactly those source IDs.
    const placeCounts = new Map<string, number>();
    for (const id of b.ids) {
      for (const pl of archive.sourcesById.get(id)?.places ?? []) {
        placeCounts.set(pl.id, (placeCounts.get(pl.id) ?? 0) + 1);
      }
    }
    const topPlaces = [...placeCounts.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 2).map(e => e[0]);
    const placeLabel = topPlaces
      .map(pid => archive.placesById.get(pid)?.display ?? pid)
      .join(' · ');
    const chapter = makeChapter({
      kind: 'decade',
      title: placeLabel ? `${label} — ${placeLabel}` : label,
      placeIds: topPlaces,
      window: {
        from: String(firstDecade),
        to: String(lastDecade + 10),
        fromClamped: true,
        toClamped: true,
      },
    });
    return { chapter, startNum: firstDecade, endNum: lastDecade + 10 };
  });
}

// ---- Assignment + finishing helpers ----------------------------------------

function assignToSpine(spine: SpineEntry[], dated: Array<{ id: string; t: number }>) {
  if (spine.length === 0) return;
  for (const d of dated) {
    let target: SpineEntry | null = null;
    for (const entry of spine) {
      const start = entry.startNum ?? -Infinity;
      const end = entry.endNum ?? Infinity;
      if (d.t >= start && d.t < end) {
        target = entry;
        break;
      }
    }
    // Before the first known window → first chapter; after the last → last.
    if (!target) target = d.t < (spine[0].startNum ?? -Infinity) ? spine[0] : spine[spine.length - 1];
    target.chapter.sourceGroups.push({ clusterId: '', sourceIds: [d.id] });
  }
}

function clusterGroups(archive: Archive, ids: string[]): StoryChapter['sourceGroups'] {
  const byCluster = new Map<string, string[]>();
  for (const id of ids) {
    const clusterId = archive.eventsById.get(`event_${id}`)?.cluster_id ?? `cluster_${id}`;
    const list = byCluster.get(clusterId) ?? [];
    list.push(id);
    byCluster.set(clusterId, list);
  }
  const groups = [...byCluster.entries()].map(([clusterId, sourceIds]) => ({
    clusterId,
    sourceIds: sourceIds.sort((a, b) =>
      (archive.sourcesById.get(a)?.date ?? '').localeCompare(archive.sourcesById.get(b)?.date ?? '')
    ),
  }));
  groups.sort((a, b) =>
    (archive.sourcesById.get(a.sourceIds[0])?.date ?? '').localeCompare(
      archive.sourcesById.get(b.sourceIds[0])?.date ?? ''
    )
  );
  return groups;
}

function overlappingContext(ch: StoryChapter): ExternalContextPeriod[] {
  const start = ch.windowNum.start ?? num(ch.window.from);
  const end = ch.windowNum.end ?? num(ch.window.to);
  if (start === null && end === null) return [];
  return EXTERNAL_CONTEXT.filter(p => {
    const ps = decimalYear(p.from);
    const pe = decimalYear(p.to);
    if (ps === null || pe === null) return false;
    return ps < (end ?? Infinity) && pe > (start ?? -Infinity);
  });
}

function chapterCoOccurrences(
  archive: Archive,
  person: PersonRecord,
  ch: StoryChapter
): ChapterCoOccurrence[] {
  const relationByPerson = new Map<string, string>();
  for (const rel of archive.relationshipsByPersonId.get(person.id) ?? []) {
    if (!rel.inverted && !relationByPerson.has(rel.person)) {
      relationByPerson.set(rel.person, rel.relation);
    }
  }

  const byPerson = new Map<string, { maxConfidence: number; sourceIds: string[] }>();
  for (const group of ch.sourceGroups) {
    for (const sid of group.sourceIds) {
      for (const link of archive.sourcesById.get(sid)?.people ?? []) {
        if (link.id === person.id) continue;
        const entry = byPerson.get(link.id) ?? { maxConfidence: 0, sourceIds: [] };
        entry.maxConfidence = Math.max(entry.maxConfidence, link.confidence_is_my_family);
        entry.sourceIds.push(sid);
        byPerson.set(link.id, entry);
      }
    }
  }

  return [...byPerson.entries()]
    .filter(([pid, e]) => e.maxConfidence >= 25 || relationByPerson.has(pid))
    .map(([pid, e]) => ({
      personId: pid,
      relation: relationByPerson.get(pid),
      sourceIds: [...new Set(e.sourceIds)],
    }))
    .sort((a, b) => b.sourceIds.length - a.sourceIds.length);
}

function makeChapter(init: {
  kind: StoryChapter['kind'];
  title: string;
  window: StoryChapter['window'];
  placeIds?: string[];
  addressStanzas?: AddressStanza[];
  residenceSourceIds?: string[];
  assignedIds?: string[];
}): StoryChapter {
  return {
    id: '',
    index: 0,
    kind: init.kind,
    title: init.title,
    placeIds: init.placeIds ?? [],
    window: init.window,
    windowNum: { start: null, end: null },
    addressStanzas: init.addressStanzas ?? [],
    residenceSourceIds: init.residenceSourceIds ?? [],
    sourceGroups: (init.assignedIds ?? []).map(id => ({ clusterId: '', sourceIds: [id] })),
    context: [],
    coOccurrences: [],
  };
}

// Deterministic, data-derived slug — the AI-narrative cache key.
function chapterSlug(ch: StoryChapter, index: number): string {
  const anchor = ch.placeIds[0] ?? ch.kind;
  const fy = cleanDate(ch.window.from)?.slice(0, 4) ?? 'x';
  const ty = cleanDate(ch.window.to)?.slice(0, 4) ?? 'x';
  return `${index}-${anchor.replace(/^place_/, '')}-${fy}-${ty}`;
}
