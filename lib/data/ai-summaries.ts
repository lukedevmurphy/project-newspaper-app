// Loader for the AI-generated clipping summaries cached under
// data-cache/clipping-summaries/<id>.json. The cache is produced
// offline by scripts/generate-clipping-summaries.mjs and committed to
// the app repo so production builds read pre-generated text rather
// than calling the Anthropic API at build time.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AiChapterNarrative, AiClippingSummary, AiPageSummary, ClippingPlacement } from './types';

const CLIPPING_CACHE_DIR = resolve('data-cache/clipping-summaries');
const PAGE_CACHE_DIR = resolve('data-cache/page-summaries');
const CHAPTER_CACHE_DIR = resolve('data-cache/story-chapters');

export function loadAiClippingSummary(id: string): AiClippingSummary | null {
  const path = join(CLIPPING_CACHE_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    if (typeof raw.summary !== 'string') return null;
    return {
      id: raw.id,
      summary: raw.summary,
      key_quotes: Array.isArray(raw.key_quotes) ? raw.key_quotes : [],
      model: raw.model,
      generated_at: raw.generated_at,
    };
  } catch {
    return null;
  }
}

// Per-chapter storyboard narratives (extension point — the generation
// script doesn't exist yet, so this returns null everywhere today).
export function loadAiChapterNarrative(personId: string, chapterId: string): AiChapterNarrative | null {
  const path = join(CHAPTER_CACHE_DIR, personId, `${chapterId}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    if (typeof raw.narrative !== 'string') return null;
    return {
      person_id: String(raw.person_id ?? personId),
      chapter_id: String(raw.chapter_id ?? chapterId),
      narrative: raw.narrative,
      sentences: Array.isArray(raw.sentences)
        ? raw.sentences
            .filter((s: unknown): s is Record<string, unknown> => !!s && typeof s === 'object')
            .map((s: Record<string, unknown>) => ({
              text: String(s.text ?? ''),
              source_ids: Array.isArray(s.source_ids) ? s.source_ids.map(String) : [],
            }))
        : [],
      model: raw.model,
      generated_at: raw.generated_at,
    };
  } catch {
    return null;
  }
}

export function loadAiPageSummary(id: string): AiPageSummary | null {
  const path = join(PAGE_CACHE_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    if (typeof raw.summary !== 'string') return null;
    const placements: ClippingPlacement[] = Array.isArray(raw.clipping_placements)
      ? raw.clipping_placements
          .filter((p: unknown): p is Record<string, unknown> => !!p && typeof p === 'object')
          .map((p: Record<string, unknown>) => ({
            clipping_id: String(p.clipping_id ?? ''),
            prominence: (p.prominence === 'lead' || p.prominence === 'buried'
              ? p.prominence
              : 'secondary') as ClippingPlacement['prominence'],
            column: String(p.column ?? ''),
            placement_note: typeof p.placement_note === 'string' ? p.placement_note : undefined,
          }))
      : [];
    return {
      id: raw.id,
      summary: raw.summary,
      headlines: Array.isArray(raw.headlines) ? raw.headlines : [],
      clipping_placements: placements,
      juxtapositions: Array.isArray(raw.juxtapositions) ? raw.juxtapositions : [],
      model: raw.model,
      generated_at: raw.generated_at,
    };
  } catch {
    return null;
  }
}
