// Loader for the AI-generated clipping summaries cached under
// data-cache/clipping-summaries/<id>.json. The cache is produced
// offline by scripts/generate-clipping-summaries.mjs and committed to
// the app repo so production builds read pre-generated text rather
// than calling the Anthropic API at build time.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AiClippingSummary } from './types';

const CACHE_DIR = resolve('data-cache/clipping-summaries');

export function loadAiClippingSummary(id: string): AiClippingSummary | null {
  const path = join(CACHE_DIR, `${id}.json`);
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
