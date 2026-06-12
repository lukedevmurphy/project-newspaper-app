// File-system + YAML loader for the data repo.
//
// CRITICAL: this loader is the boundary between the private data repo
// and the public app. It reads only an explicit allowlist of filenames:
//   metadata.yaml, transcription.md, transcription_claude.md (documents),
//   page_metadata.yaml, people.yaml, vocab/*.yaml.
// It NEVER reads notes.md — those are the user's private interpretive
// notes and must not reach the app. Binary files (source.png/jpg/pdf,
// fullpage.jpg) are never read either.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';
import type {
  Clipping,
  DateConfidence,
  DocumentPersonLink,
  DocumentSource,
  MentionedLink,
  PageRecord,
  PersonLink,
  PersonRecord,
  PlaceLink,
  PlaceRecord,
  ThreadRecord,
} from './types';

// ---- Allowlists (defence in depth) -------------------------------------

const CLIPPING_FILES_ALLOWED = new Set(['metadata.yaml', 'transcription.md']);
const PAGE_FILES_ALLOWED = new Set(['page_metadata.yaml', 'fullpage_transcription.md']);
// transcription.md is the curated verbatim text; transcription_claude.md is
// the raw vision output. notes.md and source.{png,jpg,pdf} are NEVER read.
const DOCUMENT_FILES_ALLOWED = new Set(['metadata.yaml', 'transcription.md', 'transcription_claude.md']);

// ---- Path resolution ---------------------------------------------------

// Default locations to look for the data repo, in order:
//   1. ./data                          — where scripts/clone-data.mjs lands the
//                                        clone during a Vercel / CI build.
//   2. ../project-newspaper-data       — standard sibling clone.
//   3. ../newspaper                    — the developer's current local layout.
const DEFAULT_DATA_PATHS = ['./data', '../project-newspaper-data', '../newspaper'];

export function resolveDataRoot(): string {
  const fromEnv = process.env.NEWSPAPER_DATA_PATH;
  if (fromEnv) {
    const r = resolve(fromEnv);
    if (!existsSync(r)) {
      throw new Error(`NEWSPAPER_DATA_PATH set to ${r} but path does not exist`);
    }
    if (!existsSync(join(r, 'archive'))) {
      throw new Error(`NEWSPAPER_DATA_PATH at ${r} does not contain an archive/ directory`);
    }
    return r;
  }

  for (const candidate of DEFAULT_DATA_PATHS) {
    const r = resolve(process.cwd(), candidate);
    if (existsSync(r) && existsSync(join(r, 'archive'))) return r;
  }

  throw new Error(
    `Cannot find the newspaper data repo. Set NEWSPAPER_DATA_PATH env var, ` +
    `or clone project-newspaper-data alongside this repo. Tried: ${DEFAULT_DATA_PATHS.join(', ')}`
  );
}

// ---- Low-level helpers -------------------------------------------------

function readYaml<T = unknown>(path: string): T {
  return yaml.load(readFileSync(path, 'utf-8')) as T;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listDirs(p: string): string[] {
  if (!isDir(p)) return [];
  return readdirSync(p).filter(name => isDir(join(p, name)));
}

function dateToIso(d: unknown): string | null {
  if (d == null) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === 'string') return d;
  return null;
}

// Document dates are messier than clipping dates: bare years parse from
// YAML as numbers (`date: 1917`), and approximate dates carry prefixes
// ("~1885", "c1916", "c.1917"). Returns a sortable partial-ISO `date`
// plus the verbatim value for display.
function normalizeDocDate(d: unknown): { date: string | null; raw: string | null } {
  if (d == null) return { date: null, raw: null };
  if (d instanceof Date) {
    const iso = d.toISOString().slice(0, 10);
    return { date: iso, raw: iso };
  }
  if (typeof d === 'number') return { date: String(d), raw: String(d) };
  if (typeof d !== 'string') return { date: null, raw: null };
  const raw = d.trim();
  const stripped = raw.replace(/^[~]|^c\.?\s*/i, '');
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(stripped)) return { date: stripped, raw };
  // Unparseable ("c.1980s", composite ranges): salvage a leading year if any.
  const year = stripped.match(/^\d{4}/)?.[0] ?? null;
  return { date: year, raw };
}

// ---- Raw shape (matches YAML) ------------------------------------------

interface RawClippingMeta {
  id: string;
  page_id?: string;
  source: {
    newspaper: string;
    city?: string;
    country?: string;
    date: string | Date | null;
    date_confidence: DateConfidence;
    page: number | string;
    image_url?: string | null;
    clip_url?: string | null;
    clipped_by?: string;
    clipped_date?: string | Date;
  };
  source_type?: string[];
  headline?: string;
  dateline?: string;
  summary?: string;
  people?: unknown[];
  mentioned?: unknown[];
  places?: unknown[];
  themes?: string[];
  tags?: string[];
  story_threads?: string[];
  crossrefs?: string[];
  transcription_status?: 'complete' | 'partial' | 'ocr_degraded' | 'none';
  transcription_confidence?: 'high' | 'medium' | 'low' | null;
  open_questions?: string[];
}

// ---- Normalisers -------------------------------------------------------

function normalizePeople(raw: unknown[] | undefined): PersonLink[] {
  if (!raw) return [];
  return raw.map(item => {
    const p = item as Record<string, unknown>;
    return {
      id: String(p.id ?? ''),
      role_in_story: typeof p.role_in_story === 'string' ? p.role_in_story : '',
      name_as_printed: typeof p.name_as_printed === 'string' ? p.name_as_printed : undefined,
      confidence_is_my_family: typeof p.confidence_is_my_family === 'number' ? p.confidence_is_my_family : 0,
      confidence_notes: typeof p.confidence_notes === 'string' ? p.confidence_notes : undefined,
    };
  });
}

function normalizeMentioned(raw: unknown[] | undefined): MentionedLink[] {
  if (!raw) return [];
  return raw.map(item => {
    const m = item as Record<string, unknown>;
    return {
      name_as_printed: String(m.name_as_printed ?? ''),
      role_in_story: typeof m.role_in_story === 'string' ? m.role_in_story : undefined,
      note: typeof m.note === 'string' ? m.note : undefined,
    };
  });
}

function normalizePlaces(raw: unknown[] | undefined): PlaceLink[] {
  if (!raw) return [];
  return raw.map(item => {
    if (typeof item === 'string') return { id: item, role: '' };
    const p = item as Record<string, unknown>;
    return {
      id: String(p.id ?? ''),
      role: typeof p.role === 'string' ? p.role : '',
    };
  });
}

// ---- Loaders -----------------------------------------------------------

export function loadClippings(dataRoot: string): Clipping[] {
  const clippingsDir = join(dataRoot, 'archive', 'clippings');
  if (!isDir(clippingsDir)) return [];

  const clippings: Clipping[] = [];

  for (const dirName of listDirs(clippingsDir)) {
    const dir = join(clippingsDir, dirName);
    const metaPath = join(dir, 'metadata.yaml');
    if (!CLIPPING_FILES_ALLOWED.has('metadata.yaml') || !existsSync(metaPath)) continue;

    const raw = readYaml<RawClippingMeta>(metaPath);
    if (!raw) continue;

    // Read transcription if the allowlist permits AND it exists.
    let transcription = '';
    const tPath = join(dir, 'transcription.md');
    if (CLIPPING_FILES_ALLOWED.has('transcription.md') && existsSync(tPath)) {
      transcription = readFileSync(tPath, 'utf-8');
    }

    clippings.push({
      type: 'clipping',
      id: raw.id ?? dirName,
      page_id: raw.page_id,
      newspaper: raw.source.newspaper ?? '?',
      city: raw.source.city ?? '',
      country: raw.source.country ?? '',
      date: dateToIso(raw.source.date),
      date_confidence: raw.source.date_confidence ?? 'unknown',
      page: raw.source.page ?? '?',
      image_url: raw.source.image_url ?? null,
      clip_url: raw.source.clip_url ?? null,
      headline: raw.headline ?? '',
      dateline: raw.dateline ?? '',
      summary: (raw.summary ?? '').trim(),
      source_type: raw.source_type ?? [],
      people: normalizePeople(raw.people),
      mentioned: normalizeMentioned(raw.mentioned),
      places: normalizePlaces(raw.places),
      themes: raw.themes ?? [],
      tags: raw.tags ?? [],
      story_threads: raw.story_threads ?? [],
      crossrefs: raw.crossrefs ?? [],
      transcription,
      transcription_status: raw.transcription_status ?? 'none',
      transcription_confidence: raw.transcription_confidence ?? null,
      open_questions: raw.open_questions ?? [],
      clipped_by: raw.source.clipped_by,
      clipped_date: dateToIso(raw.source.clipped_date) ?? undefined,
    });
  }

  return clippings;
}

// ---- Documents (archive/documents/<type>/<id>/) -------------------------

const AS_PRINTED_FIELDS = [
  'role_in_source',
  'age_as_printed',
  'sex_as_printed',
  'birth_year_as_printed',
  'birth_date_as_printed',
  'birth_place_as_printed',
  'death_place_as_printed',
  'marital_status_as_printed',
  'occupation_as_printed',
  'residence_as_printed',
  'naturalization_status_as_printed',
  'years_in_us',
  'destination_as_printed',
  'note',
] as const;

function normalizeDocumentPeople(raw: unknown[] | undefined): DocumentPersonLink[] {
  if (!raw) return [];
  return raw.map(item => {
    const p = item as Record<string, unknown>;
    const link: DocumentPersonLink = {
      id: String(p.id ?? ''),
      // Documents use role_in_source; mirror it into role_in_story so the
      // indexer and existing UI reads work unchanged.
      role_in_story:
        typeof p.role_in_story === 'string' ? p.role_in_story :
        typeof p.role_in_source === 'string' ? p.role_in_source : '',
      name_as_printed: typeof p.name_as_printed === 'string' ? p.name_as_printed : undefined,
      confidence_is_my_family: typeof p.confidence_is_my_family === 'number' ? p.confidence_is_my_family : 0,
      confidence_notes: typeof p.confidence_notes === 'string' ? p.confidence_notes : undefined,
    };
    for (const field of AS_PRINTED_FIELDS) {
      const v = p[field];
      // YAML parses values like `birth_year_as_printed: 1858` as numbers
      // and `1858-04` shapes inconsistently — coerce everything to string.
      if (v != null && (typeof v === 'string' || typeof v === 'number')) {
        link[field] = String(v);
      } else if (v instanceof Date) {
        link[field] = v.toISOString().slice(0, 10);
      }
    }
    return link;
  });
}

export function loadDocuments(dataRoot: string): DocumentSource[] {
  const documentsDir = join(dataRoot, 'archive', 'documents');
  if (!isDir(documentsDir)) return [];

  const documents: DocumentSource[] = [];

  for (const typeDir of listDirs(documentsDir)) {
    for (const dirName of listDirs(join(documentsDir, typeDir))) {
      const dir = join(documentsDir, typeDir, dirName);
      const metaPath = join(dir, 'metadata.yaml');
      if (!DOCUMENT_FILES_ALLOWED.has('metadata.yaml') || !existsSync(metaPath)) continue;

      const raw = readYaml<Record<string, unknown>>(metaPath);
      if (!raw) continue;
      const src = (raw.source as Record<string, unknown>) ?? {};

      // Prefer the curated transcription over the raw vision output.
      let transcription = '';
      for (const name of ['transcription.md', 'transcription_claude.md']) {
        const tPath = join(dir, name);
        if (DOCUMENT_FILES_ALLOWED.has(name) && existsSync(tPath)) {
          transcription = readFileSync(tPath, 'utf-8');
          break;
        }
      }

      const { date, raw: dateRaw } = normalizeDocDate(src.date);

      documents.push({
        type: 'document',
        id: (raw.id as string) ?? dirName,
        document_type: (raw.document_type as string) ?? typeDir,
        focus: raw.focus === 'primary' ? 'primary' : 'secondary',
        original_filename: raw.original_filename as string | undefined,
        headline: (raw.headline as string) ?? '',
        collection: (src.collection as string) ?? '',
        agency: (src.agency as string) ?? '',
        jurisdiction: (src.jurisdiction as string) ?? '',
        reference: (src.reference as string) ?? '',
        accessed_url: (src.accessed_url as string | null) ?? null,
        accessed_by: src.accessed_by as string | undefined,
        accessed_date: dateToIso(src.accessed_date) ?? undefined,
        date,
        date_raw: dateRaw,
        date_confidence: (src.date_confidence as DateConfidence) ?? 'unknown',
        summary: ((raw.summary as string) ?? '').trim(),
        people: normalizeDocumentPeople(raw.people as unknown[] | undefined),
        mentioned: normalizeMentioned(raw.mentioned as unknown[] | undefined),
        places: normalizePlaces(raw.places as unknown[] | undefined),
        themes: (raw.themes as string[]) ?? [],
        tags: (raw.tags as string[]) ?? [],
        story_threads: (raw.story_threads as string[]) ?? [],
        crossrefs: (raw.crossrefs as string[]) ?? [],
        transcription,
        transcription_status: (raw.transcription_status as DocumentSource['transcription_status']) ?? 'none',
        transcription_confidence: (raw.transcription_confidence as DocumentSource['transcription_confidence']) ?? null,
        open_questions: (raw.open_questions as string[]) ?? [],
      });
    }
  }

  return documents;
}

export function loadPages(dataRoot: string): PageRecord[] {
  const pagesDir = join(dataRoot, 'archive', 'pages');
  if (!isDir(pagesDir)) return [];

  const pages: PageRecord[] = [];
  for (const dirName of listDirs(pagesDir)) {
    const metaPath = join(pagesDir, dirName, 'page_metadata.yaml');
    if (!PAGE_FILES_ALLOWED.has('page_metadata.yaml') || !existsSync(metaPath)) continue;
    const raw = readYaml<Record<string, unknown>>(metaPath);
    if (!raw) continue;

    let fullTranscription: PageRecord['full_transcription'];
    let transcriptionStatus: PageRecord['full_transcription_status'];
    let transcriptionModel: PageRecord['full_transcription_model'];
    const ftPath = join(pagesDir, dirName, 'fullpage_transcription.md');
    if (PAGE_FILES_ALLOWED.has('fullpage_transcription.md') && existsSync(ftPath)) {
      const text = readFileSync(ftPath, 'utf-8');
      const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
      if (m) {
        try {
          const fm = yaml.load(m[1]) as Record<string, unknown> | null;
          const status = fm?.transcription_status;
          if (status === 'ai_generated' || status === 'ai_truncated' || status === 'human_corrected') {
            transcriptionStatus = status;
          }
          transcriptionModel = typeof fm?.model === 'string' ? fm.model : undefined;
        } catch { /* malformed front-matter — keep the body anyway */ }
        fullTranscription = text.slice(m[0].length).trim();
      } else {
        fullTranscription = text.trim();
      }
    }

    pages.push({
      full_transcription: fullTranscription,
      full_transcription_status: transcriptionStatus,
      full_transcription_model: transcriptionModel,
      id: (raw.id as string) ?? dirName,
      newspaper: (raw.newspaper as string) ?? '?',
      city: raw.city as string | undefined,
      country: raw.country as string | undefined,
      date: dateToIso(raw.date),
      page: (raw.page as number | string) ?? '?',
      url: (raw.url as string | null) ?? null,
      original_filename_jpg: raw.original_filename_jpg as string | undefined,
      clippings: (raw.clippings as string[]) ?? [],
      peripheral_items: ((raw.peripheral_items as unknown[]) ?? []).map(p => p as PageRecord['peripheral_items'][number]),
    });
  }

  return pages;
}

export function loadPeople(dataRoot: string): PersonRecord[] {
  const path = join(dataRoot, 'archive', 'people', 'people.yaml');
  if (!existsSync(path)) return [];

  const raw = readYaml<Record<string, Record<string, unknown>>>(path);
  if (!raw) return [];

  return Object.entries(raw).map(([id, p]) => ({
    id,
    display_name: (p.display_name as string) ?? id,
    also_known_as: (p.also_known_as as string[]) ?? [],
    disambiguation: p.disambiguation as string | undefined,
    affiliations: (p.affiliations as string[]) ?? [],
    birth: normalizeLifeEvent(p.birth),
    death: normalizeLifeEvent(p.death),
    primary_residence: (p.primary_residence as string | null) ?? null,
    relationships: (p.relationships as PersonRecord['relationships']) ?? [],
    is_my_family: (p.is_my_family as boolean) ?? false,
    family_confidence: (p.family_confidence as number) ?? 0,
    family_notes: p.family_notes as string | undefined,
    is_book_subject: (p.is_book_subject as boolean) ?? false,
    residences: normalizeResidences(p.residences),
  }));
}

// YAML parses full ISO dates as JS Date objects and bare years as
// numbers; normalize so birth/death dates are always strings.
function normalizeLifeEvent(raw: unknown): PersonRecord['birth'] {
  const e = (raw as Record<string, unknown>) ?? {};
  const date = e.date;
  return {
    date: typeof date === 'number' ? String(date) : dateToIso(date),
    place: typeof e.place === 'string' ? e.place : null,
    confidence: typeof e.confidence === 'number' ? e.confidence : 0,
  };
}

function normalizeResidences(raw: unknown): PersonRecord['residences'] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    const r = item as Record<string, unknown>;
    const dr = (r.date_range as Record<string, unknown>) ?? {};
    return {
      place: String(r.place ?? ''),
      address: typeof r.address === 'string' ? r.address : undefined,
      date_range: {
        from: dateToIso(dr.from),
        to: dateToIso(dr.to),
      },
      sources: Array.isArray(r.sources) ? (r.sources as string[]) : [],
      confidence: typeof r.confidence === 'number' ? r.confidence : 0,
      notes: typeof r.notes === 'string' ? r.notes : undefined,
    };
  });
}

export function loadPlaces(dataRoot: string): PlaceRecord[] {
  const path = join(dataRoot, 'archive', 'vocab', 'places.yaml');
  if (!existsSync(path)) return [];

  const raw = readYaml<Record<string, Record<string, unknown>>>(path);
  if (!raw) return [];

  return Object.entries(raw).map(([id, p]) => ({
    id,
    display: (p.display as string) ?? id,
    variants: (p.variants as string[]) ?? [],
    parent: (p.parent as string | null) ?? null,
    notes: p.notes as string | undefined,
  }));
}

export function loadThreads(dataRoot: string): ThreadRecord[] {
  const path = join(dataRoot, 'archive', 'vocab', 'threads.yaml');
  if (!existsSync(path)) return [];

  const raw = readYaml<Record<string, Record<string, unknown>>>(path);
  if (!raw) return [];

  return Object.entries(raw).map(([id, t]) => ({
    id,
    display: (t.display as string) ?? id,
    description: (t.description as string) ?? '',
  }));
}

export function loadVocabList(dataRoot: string, name: string): string[] {
  const path = join(dataRoot, 'archive', 'vocab', `${name}.yaml`);
  if (!existsSync(path)) return [];

  const raw = readYaml<unknown>(path);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'object') return Object.keys(raw as object);
  return [];
}
