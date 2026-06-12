// Build the public URL for a registered photo crop. Images live in an
// external Cloudflare R2 bucket (the single deliberate exception to
// the no-binaries rule — see CLAUDE.md); the app derives URLs from the
// deterministic image_key, so the bucket is swappable via one env var.
//
// Returns null when NEXT_PUBLIC_IMAGE_BASE_URL is unset (e.g. local
// dev without the bucket) — callers render nothing in that case.

import type { PhotoRecord } from './types';

export function photoUrl(photo: PhotoRecord): string | null {
  const base = process.env.NEXT_PUBLIC_IMAGE_BASE_URL;
  if (!base || !photo.image_key) return null;
  return `${base.replace(/\/+$/, '')}/${photo.image_key}`;
}
