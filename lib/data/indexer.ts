// Builds the in-memory cross-reference indexes and stats from the
// loaded raw records.

import type {
  Archive,
  ArchiveStats,
  Clipping,
  MentionedLink,
  PageRecord,
  PersonRecord,
  PlaceRecord,
  Source,
  ThreadRecord,
} from './types';

export function buildIndex(input: {
  sources: Source[];
  people: PersonRecord[];
  places: PlaceRecord[];
  themes: string[];
  tags: string[];
  sourceTypes: string[];
  threads: ThreadRecord[];
  pages: PageRecord[];
}): Archive {
  const { sources, people, places, themes, tags, sourceTypes, threads, pages } = input;

  const sourcesById = new Map(sources.map(s => [s.id, s]));
  const peopleById = new Map(people.map(p => [p.id, p]));
  const placesById = new Map(places.map(p => [p.id, p]));
  const threadsById = new Map(threads.map(t => [t.id, t]));
  const pagesById = new Map(pages.map(p => [p.id, p]));

  const sourcesByPersonId = new Map<string, string[]>();
  const sourcesByPlaceId = new Map<string, string[]>();
  const sourcesByTheme = new Map<string, string[]>();
  const sourcesByThread = new Map<string, string[]>();
  const mentionedByName = new Map<string, { sourceId: string; mention: MentionedLink }[]>();

  for (const source of sources) {
    for (const p of source.people) {
      const list = sourcesByPersonId.get(p.id) ?? [];
      list.push(source.id);
      sourcesByPersonId.set(p.id, list);
    }
    for (const m of source.mentioned) {
      const key = (m.name_as_printed || '').toLowerCase();
      if (!key) continue;
      const list = mentionedByName.get(key) ?? [];
      list.push({ sourceId: source.id, mention: m });
      mentionedByName.set(key, list);
    }
    for (const pl of source.places) {
      const list = sourcesByPlaceId.get(pl.id) ?? [];
      list.push(source.id);
      sourcesByPlaceId.set(pl.id, list);
    }
    for (const t of source.themes) {
      const list = sourcesByTheme.get(t) ?? [];
      list.push(source.id);
      sourcesByTheme.set(t, list);
    }
    for (const t of source.story_threads) {
      const list = sourcesByThread.get(t) ?? [];
      list.push(source.id);
      sourcesByThread.set(t, list);
    }
  }

  // ---- Stats ----------------------------------------------------------

  const sourcesByType: Record<string, number> = {};
  for (const s of sources) sourcesByType[s.type] = (sourcesByType[s.type] ?? 0) + 1;

  const peopleByConfidenceBand = { gte95: 0, band75to94: 0, band25to74: 0, band10to24: 0, zero: 0 };
  for (const p of people) {
    const c = p.family_confidence;
    if (c >= 95) peopleByConfidenceBand.gte95++;
    else if (c >= 75) peopleByConfidenceBand.band75to94++;
    else if (c >= 25) peopleByConfidenceBand.band25to74++;
    else if (c >= 10) peopleByConfidenceBand.band10to24++;
    else peopleByConfidenceBand.zero++;
  }

  const usedPlaces = new Set<string>();
  const usedThemes = new Set<string>();
  const usedTags = new Set<string>();
  const usedSourceTypes = new Set<string>();
  const usedThreads = new Set<string>();
  for (const s of sources) {
    s.places.forEach(p => usedPlaces.add(p.id));
    s.themes.forEach(t => usedThemes.add(t));
    s.tags.forEach(t => usedTags.add(t));
    s.story_threads.forEach(t => usedThreads.add(t));
    if (s.type === 'clipping') (s as Clipping).source_type.forEach(t => usedSourceTypes.add(t));
  }
  const declaredPlaces = new Set(places.map(p => p.id));
  const declaredThemes = new Set(themes);
  const declaredTags = new Set(tags);
  const declaredSourceTypes = new Set(sourceTypes);
  const declaredThreads = new Set(threads.map(t => t.id));

  const usage = (declared: Set<string>, used: Set<string>) => ({
    declared: declared.size,
    used: used.size,
    unused: [...declared].filter(x => !used.has(x)).length,
    orphan: [...used].filter(x => !declared.has(x)).length,
  });

  const vocabUsage: ArchiveStats['vocabUsage'] = {
    places: usage(declaredPlaces, usedPlaces),
    themes: usage(declaredThemes, usedThemes),
    tags: usage(declaredTags, usedTags),
    sourceTypes: usage(declaredSourceTypes, usedSourceTypes),
    threads: usage(declaredThreads, usedThreads),
  };

  const dates = sources.map(s => s.date).filter((d): d is string => !!d).sort();
  const dateRange = {
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
  };

  const stats: ArchiveStats = {
    totalSources: sources.length,
    sourcesByType,
    totalPeople: people.length,
    peopleByConfidenceBand,
    totalPlaces: places.length,
    totalThemes: themes.length,
    totalTags: tags.length,
    totalSourceTypes: sourceTypes.length,
    totalThreads: threads.length,
    totalPages: pages.length,
    vocabUsage,
    dateRange,
  };

  return {
    sources, sourcesById,
    people, peopleById,
    places, placesById,
    themes, tags, sourceTypes,
    threads, threadsById,
    pages, pagesById,
    sourcesByPersonId, sourcesByPlaceId, sourcesByTheme, sourcesByThread,
    mentionedByName,
    stats,
  };
}
