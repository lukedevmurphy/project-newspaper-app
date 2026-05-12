// File-system + YAML loader for the data repo.
//
// CRITICAL: this loader is the boundary between the private data repo
// and the public app. It reads only an explicit allowlist of filenames:
//   metadata.yaml, transcription.md, page_metadata.yaml, people.yaml,
//   vocab/*.yaml.
// It NEVER reads notes.md — those are the user's private interpretive
// notes and must not reach the app.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';
import type {
  Clipping,
  DateConfidence,
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
const PAGE_FILES_ALLOWED = new Set(['page_metadata.yaml']);

// ---- Path resolution ---------------------------------------------------

const DEFAULT_DATA_PATHS = ['../project-newspaper-data', '../newspaper'];

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

export function loadPages(dataRoot: string): PageRecord[] {
  const pagesDir = join(dataRoot, 'archive', 'pages');
  if (!isDir(pagesDir)) return [];

  const pages: PageRecord[] = [];
  for (const dirName of listDirs(pagesDir)) {
    const metaPath = join(pagesDir, dirName, 'page_metadata.yaml');
    if (!PAGE_FILES_ALLOWED.has('page_metadata.yaml') || !existsSync(metaPath)) continue;
    const raw = readYaml<Record<string, unknown>>(metaPath);
    if (!raw) continue;

    pages.push({
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
    birth: (p.birth as PersonRecord['birth']) ?? { date: null, place: null, confidence: 0 },
    death: (p.death as PersonRecord['death']) ?? { date: null, place: null, confidence: 0 },
    primary_residence: (p.primary_residence as string | null) ?? null,
    relationships: (p.relationships as PersonRecord['relationships']) ?? [],
    is_my_family: (p.is_my_family as boolean) ?? false,
    family_confidence: (p.family_confidence as number) ?? 0,
    family_notes: p.family_notes as string | undefined,
  }));
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
