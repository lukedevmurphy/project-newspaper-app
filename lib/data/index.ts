// Public entry point. The rest of the app imports ONLY from `@/lib/data`.
// When the data layer eventually moves to Postgres, this file is the
// surgical swap point.

import {
  loadClippings,
  loadPages,
  loadPeople,
  loadPlaces,
  loadThreads,
  loadVocabList,
  resolveDataRoot,
} from './loader';
import { buildIndex } from './indexer';
import type { Archive, Source } from './types';

let cached: Archive | null = null;

export function loadArchive(): Archive {
  if (cached) return cached;

  const dataRoot = resolveDataRoot();

  const clippings = loadClippings(dataRoot);
  const sources: Source[] = clippings;
  const pages = loadPages(dataRoot);
  const people = loadPeople(dataRoot);
  const places = loadPlaces(dataRoot);
  const themes = loadVocabList(dataRoot, 'themes');
  const tags = loadVocabList(dataRoot, 'tags');
  const sourceTypes = loadVocabList(dataRoot, 'source_types');
  const threads = loadThreads(dataRoot);

  cached = buildIndex({ sources, people, places, themes, tags, sourceTypes, threads, pages });
  return cached;
}

export type {
  Archive,
  ArchiveStats,
  Clipping,
  DateConfidence,
  DerivedEvent,
  MentionedLink,
  PageRecord,
  PeripheralItem,
  PersonLink,
  PersonRecord,
  PersonRelationship,
  PlaceLink,
  PlaceRecord,
  Residence,
  Source,
  SourceBase,
  ThreadRecord,
} from './types';
