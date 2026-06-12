// Builds the in-memory cross-reference indexes and stats from the
// loaded raw records.

import type {
  Archive,
  ArchiveStats,
  Clipping,
  DerivedEvent,
  MentionedLink,
  PageRecord,
  PersonRecord,
  PlaceRecord,
  Source,
  ThreadRecord,
} from './types';
import { resolveRelationships } from './relations';

export function buildIndex(input: {
  sources: Source[];
  people: PersonRecord[];
  places: PlaceRecord[];
  themes: string[];
  tags: string[];
  sourceTypes: string[];
  documentTypes: string[];
  threads: ThreadRecord[];
  pages: PageRecord[];
}): Archive {
  const { sources, people, places, themes, tags, sourceTypes, documentTypes, threads, pages } = input;

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

  // ---- Relationship nexus ----------------------------------------------

  const relationshipsByPersonId = resolveRelationships(people);

  // Pairwise co-appearance: person → other person → shared source IDs.
  // All confidence levels count — the UI shows the source list, so weak
  // links are self-evidently attributed.
  const coAppearancesByPersonId = new Map<string, Map<string, string[]>>();
  for (const source of sources) {
    const ids = [...new Set(source.people.map(p => p.id))];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        let inner = coAppearancesByPersonId.get(a);
        if (!inner) {
          inner = new Map();
          coAppearancesByPersonId.set(a, inner);
        }
        const list = inner.get(b) ?? [];
        list.push(source.id);
        inner.set(b, list);
      }
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
  const usedDocumentTypes = new Set<string>();
  const usedThreads = new Set<string>();
  for (const s of sources) {
    s.places.forEach(p => usedPlaces.add(p.id));
    s.themes.forEach(t => usedThemes.add(t));
    s.tags.forEach(t => usedTags.add(t));
    s.story_threads.forEach(t => usedThreads.add(t));
    if (s.type === 'clipping') (s as Clipping).source_type.forEach(t => usedSourceTypes.add(t));
    if (s.type === 'document') usedDocumentTypes.add(s.document_type);
  }
  const declaredPlaces = new Set(places.map(p => p.id));
  const declaredThemes = new Set(themes);
  const declaredTags = new Set(tags);
  const declaredSourceTypes = new Set(sourceTypes);
  const declaredDocumentTypes = new Set(documentTypes);
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
    documentTypes: usage(declaredDocumentTypes, usedDocumentTypes),
    threads: usage(declaredThreads, usedThreads),
  };

  const dates = sources.map(s => s.date).filter((d): d is string => !!d).sort();
  const dateRange = {
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
  };

  // ---- Derived events -------------------------------------------------
  // One event per source. cluster_id groups crossref-linked sources via
  // connected components in the crossref graph (treated as undirected).
  // The book wants each source citable separately; clustering is for
  // visual proximity on the timeline, not collapse.

  const clusterByEventId = computeCrossrefClusters(sources, sourcesById);

  const events: DerivedEvent[] = sources.map(s => deriveEvent(s, clusterByEventId.get(eventIdFor(s.id))!));
  const eventsById = new Map(events.map(e => [e.id, e]));
  const eventsByClusterId = new Map<string, DerivedEvent[]>();
  for (const e of events) {
    const bucket = eventsByClusterId.get(e.cluster_id) ?? [];
    bucket.push(e);
    eventsByClusterId.set(e.cluster_id, bucket);
  }

  const totalBookSubjects = people.filter(p => p.is_book_subject === true).length;

  const stats: ArchiveStats = {
    totalSources: sources.length,
    sourcesByType,
    totalPeople: people.length,
    totalBookSubjects,
    peopleByConfidenceBand,
    totalPlaces: places.length,
    totalThemes: themes.length,
    totalTags: tags.length,
    totalSourceTypes: sourceTypes.length,
    totalThreads: threads.length,
    totalPages: pages.length,
    totalEvents: events.length,
    totalEventClusters: eventsByClusterId.size,
    vocabUsage,
    dateRange,
  };

  return {
    sources, sourcesById,
    people, peopleById,
    places, placesById,
    themes, tags, sourceTypes, documentTypes,
    threads, threadsById,
    pages, pagesById,
    sourcesByPersonId, sourcesByPlaceId, sourcesByTheme, sourcesByThread,
    mentionedByName,
    relationshipsByPersonId, coAppearancesByPersonId,
    events, eventsById, eventsByClusterId,
    stats,
  };
}

// ---- Event derivation helpers -------------------------------------------

function eventIdFor(sourceId: string): string {
  return `event_${sourceId}`;
}

function deriveEvent(source: Source, clusterId: string): DerivedEvent {
  return {
    id: eventIdFor(source.id),
    source_id: source.id,
    date: source.date,
    date_confidence: source.date_confidence,
    title: titleFor(source),
    summary: source.summary,
    places: source.places,
    people: source.people,
    themes: source.themes,
    story_threads: source.story_threads,
    cluster_id: clusterId,
  };
}

function titleFor(source: Source): string {
  if ('headline' in source && source.headline) {
    return source.headline.split('/').map(p => p.trim()).filter(Boolean)[0] ?? source.headline;
  }
  // Fall back to the first sentence of the summary, capped.
  const s = source.summary.trim();
  if (!s) return source.id;
  const firstSentence = s.match(/^[^.!?]+[.!?]/)?.[0] ?? s;
  return firstSentence.length > 100 ? firstSentence.slice(0, 100) + '…' : firstSentence;
}

/**
 * Build connected components on the crossref graph (treated as
 * undirected — if A.crossrefs contains B OR B.crossrefs contains A,
 * they're connected).
 *
 * Returns a map from event_id → cluster_id. Cluster IDs are stable per
 * component (deterministic: the alphabetically-first source ID in the
 * component, prefixed "cluster_").
 */
function computeCrossrefClusters(sources: Source[], sourcesById: Map<string, Source>): Map<string, string> {
  // Build undirected adjacency.
  const adj = new Map<string, Set<string>>();
  for (const s of sources) {
    if (!adj.has(s.id)) adj.set(s.id, new Set());
    for (const ref of s.crossrefs) {
      if (!sourcesById.has(ref)) continue; // skip unresolved (predicted) IDs
      adj.get(s.id)!.add(ref);
      if (!adj.has(ref)) adj.set(ref, new Set());
      adj.get(ref)!.add(s.id);
    }
  }

  // DFS each unvisited node to find its component.
  const visited = new Set<string>();
  const result = new Map<string, string>(); // eventId -> clusterId
  for (const s of sources) {
    if (visited.has(s.id)) continue;
    const component: string[] = [];
    const stack = [s.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      component.push(id);
      for (const neighbor of adj.get(id) ?? []) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }
    component.sort();
    const clusterId = `cluster_${component[0]}`;
    for (const sid of component) {
      result.set(eventIdFor(sid), clusterId);
    }
  }
  return result;
}
