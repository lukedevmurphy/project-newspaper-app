// Public entry point. The rest of the app imports ONLY from `@/lib/data`.
// When the data layer eventually moves to Postgres, this file is the
// surgical swap point.

import {
  loadClippings,
  loadDocuments,
  loadPages,
  loadPeople,
  loadPlaces,
  loadThreads,
  loadVocabList,
  resolveDataRoot,
} from './loader';
import { buildIndex } from './indexer';
import type { Archive, Source } from './types';

export { loadAiClippingSummary, loadAiPageSummary } from './ai-summaries';

let cached: Archive | null = null;

export function loadArchive(): Archive {
  if (cached) return cached;

  const dataRoot = resolveDataRoot();

  const clippings = loadClippings(dataRoot);
  const documents = loadDocuments(dataRoot);
  const sources: Source[] = [...clippings, ...documents];

  // Clippings and documents share one ID namespace by design (crossrefs
  // span types), so a collision must fail the build loudly — a silent
  // Map overwrite would drop a source.
  const seen = new Set<string>();
  for (const s of sources) {
    if (seen.has(s.id)) throw new Error(`Duplicate source id across clippings/documents: ${s.id}`);
    seen.add(s.id);
  }

  const pages = loadPages(dataRoot);
  const people = loadPeople(dataRoot);
  const places = loadPlaces(dataRoot);
  const themes = loadVocabList(dataRoot, 'themes');
  const tags = loadVocabList(dataRoot, 'tags');
  const sourceTypes = loadVocabList(dataRoot, 'source_types');
  const documentTypes = loadVocabList(dataRoot, 'document_types');
  const threads = loadThreads(dataRoot);

  cached = buildIndex({ sources, people, places, themes, tags, sourceTypes, documentTypes, threads, pages });
  return cached;
}

export { documentGroup } from './types';
export { humanizeDocumentType, sourceListing } from './citation';
export type { ResolvedRelationship } from './relations';
export type {
  AiClippingSummary,
  AiPageSummary,
  Archive,
  ArchiveStats,
  Clipping,
  ClippingPlacement,
  ClippingProminence,
  DateConfidence,
  DerivedEvent,
  DocumentPersonLink,
  DocumentSource,
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
