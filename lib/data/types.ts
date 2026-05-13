// Archive types — the single source of truth for what the rest of the
// app reads. Sources are a DISCRIMINATED UNION on `.type`; adding a new
// source type later (CensusRecord, GedcomImport, PersonalNote, Photo)
// is additive: define the new interface, add to `Source`, and add a
// renderer in `app/sources/[id]/page.tsx` that switches on .type.

export type DateConfidence = 'certain' | 'approximate' | 'inferred' | 'unknown';

export interface PersonLink {
  id: string;
  role_in_story: string;
  name_as_printed?: string;
  confidence_is_my_family: number; // 0–100
  confidence_notes?: string;
}

export interface PlaceLink {
  id: string;
  role: string;
}

export interface MentionedLink {
  name_as_printed: string;
  role_in_story?: string;
  note?: string;
}

export interface SourceBase {
  id: string;
  date: string | null;        // ISO yyyy-mm-dd or partial (yyyy, yyyy-mm)
  date_confidence: DateConfidence;
  summary: string;
  people: PersonLink[];
  mentioned: MentionedLink[];
  places: PlaceLink[];
  themes: string[];
  tags: string[];
  story_threads: string[];
  crossrefs: string[];
  transcription: string;      // verbatim text. NEVER reads notes.md.
  transcription_status: 'complete' | 'partial' | 'ocr_degraded' | 'none';
  transcription_confidence: 'high' | 'medium' | 'low' | null;
}

export interface Clipping extends SourceBase {
  type: 'clipping';
  newspaper: string;
  city: string;
  country: string;
  page: number | string;
  image_url: string | null;
  clip_url: string | null;
  headline: string;
  dateline: string;
  source_type: string[];      // controlled vocab: news_item, wire_item, court_report, etc.
  page_id?: string;
  clipped_by?: string;
  clipped_date?: string;
  open_questions: string[];
}

// Future source subtypes go here, then in the Source union below.
// e.g. CensusRecord, GedcomImport, PersonalNote, Photograph.

export type Source = Clipping;

// ---- People, places, threads, pages -----------------------------------

export interface PersonRelationship {
  relation: string;            // mother_of, son_of, brother_of, married_to, etc.
  person: string;              // person_id
}

export interface Residence {
  place: string;                // place_id (preferred); free-text fallback allowed
  address?: string;             // street address, neighborhood, or institutional name
  date_range: {
    from: string | null;        // ISO yyyy-mm-dd, or partial yyyy / yyyy-mm
    to: string | null;
  };
  sources: string[];            // source IDs that establish this residence
  confidence: number;           // 0–100; how sure we are about the residence fact
  notes?: string;
}

export interface PersonRecord {
  id: string;
  display_name: string;
  also_known_as: string[];
  disambiguation?: string;
  affiliations?: string[];
  birth: { date: string | null; place: string | null; confidence: number };
  death: { date: string | null; place: string | null; confidence: number };
  primary_residence: string | null;
  relationships: PersonRelationship[];
  is_my_family: boolean;
  family_confidence: number;    // 0–100; see CLAUDE.md for the scale
  family_notes?: string;
  is_book_subject?: boolean;    // default false. Drives timeline top band.
  residences?: Residence[];     // citation-backed place + date_range entries
}

export interface PlaceRecord {
  id: string;
  display: string;
  variants: string[];
  parent: string | null;
  notes?: string;
}

export interface ThreadRecord {
  id: string;
  display: string;
  description: string;
}

export interface PeripheralItem {
  title: string;
  summary?: string;
  tags?: string[];
}

export interface PageRecord {
  id: string;
  newspaper: string;
  city?: string;
  country?: string;
  date: string | null;
  page: number | string;
  url: string | null;
  original_filename_jpg?: string;
  clippings: string[];
  peripheral_items: PeripheralItem[];
}

// ---- Derived events ----------------------------------------------------

// An "event" is the historical occurrence a source witnesses. v1 is
// pure derivation: one event per source, with the source's
// publication date as the event date. Crossref-linked sources share
// a cluster_id so the timeline UI can group them visually without
// collapsing them (the book wants each source citable individually).
//
// v2 (not implemented): a clipping may declare `events: [...]` in its
// YAML to override this default and emit multiple finer-grained
// events (e.g. the 1846 Times piece describes the Dec 10 works
// stoppage, Sullivan's late-Dec death, AND Curtin's November death).

export interface DerivedEvent {
  id: string;                   // "event_" + source_id
  source_id: string;            // the witnessing source
  date: string | null;          // source.date
  date_confidence: DateConfidence;
  title: string;                // source.headline OR firstSentence(source.summary)
  summary: string;              // source.summary (full)
  places: PlaceLink[];          // from source
  people: PersonLink[];         // from source
  themes: string[];             // from source
  story_threads: string[];      // from source
  cluster_id: string;           // shared by sources mutually crossref-linked
}

// ---- Assembled archive --------------------------------------------------

export interface ArchiveStats {
  totalSources: number;
  sourcesByType: Record<string, number>;
  totalPeople: number;
  totalBookSubjects: number;
  peopleByConfidenceBand: {
    gte95: number;
    band75to94: number;
    band25to74: number;
    band10to24: number;
    zero: number;
  };
  totalPlaces: number;
  totalThemes: number;
  totalTags: number;
  totalSourceTypes: number;
  totalThreads: number;
  totalPages: number;
  totalEvents: number;
  totalEventClusters: number;
  vocabUsage: Record<string, { declared: number; used: number; unused: number; orphan: number }>;
  dateRange: { earliest: string | null; latest: string | null };
}

export interface Archive {
  sources: Source[];
  sourcesById: Map<string, Source>;

  people: PersonRecord[];
  peopleById: Map<string, PersonRecord>;

  places: PlaceRecord[];
  placesById: Map<string, PlaceRecord>;

  themes: string[];
  tags: string[];
  sourceTypes: string[];
  threads: ThreadRecord[];
  threadsById: Map<string, ThreadRecord>;

  pages: PageRecord[];
  pagesById: Map<string, PageRecord>;

  // Cross-references
  sourcesByPersonId: Map<string, string[]>;
  sourcesByPlaceId: Map<string, string[]>;
  sourcesByTheme: Map<string, string[]>;
  sourcesByThread: Map<string, string[]>;
  mentionedByName: Map<string, { sourceId: string; mention: MentionedLink }[]>;

  // Derived events (one per source). cluster_id groups crossref-linked
  // sources for the timeline UI without collapsing them.
  events: DerivedEvent[];
  eventsById: Map<string, DerivedEvent>;
  eventsByClusterId: Map<string, DerivedEvent[]>;

  stats: ArchiveStats;
}
