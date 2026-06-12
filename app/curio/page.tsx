// /curio — the curio cabinet. A browsable feed of clippings tagged
// color, funny, poignant, or ironic. The kind of source you reach
// for when you want period texture or a light moment, not when
// you're researching the book's spine.
//
// v1: filter + present. Teasers = first 1–2 sentences of the
// clipping's summary, with mood-tag chips. Click any item to open
// the source detail page.
//
// v2 (deferred to AI-features phase): AI-generated one-line teasers.

import Link from 'next/link';
import { loadArchive } from '@/lib/data';
import type { Source } from '@/lib/data';

const CURIO_TAGS = ['color', 'funny', 'poignant', 'ironic'] as const;
type CurioTag = (typeof CURIO_TAGS)[number];

export default function CurioPage() {
  const archive = loadArchive();

  // Pick clippings carrying at least one curio tag. Skip ones also
  // tagged `heavy` unless they're tagged `poignant` or `ironic`
  // (those moods belong; "heavy" alone is mine-fire / death weight,
  // which isn't curio).
  const curioSources = archive.sources.filter(s => {
    const tags = s.tags ?? [];
    const moods = tags.filter((t): t is CurioTag => CURIO_TAGS.includes(t as CurioTag));
    if (moods.length === 0) return false;
    if (tags.includes('heavy') && !tags.includes('poignant') && !tags.includes('ironic')) {
      return false;
    }
    return true;
  });

  // Sort by date (oldest first — the period flavor reads
  // chronologically). User can reverse via browser scroll.
  curioSources.sort((a, b) => {
    const ad = a.date ?? '';
    const bd = b.date ?? '';
    return ad.localeCompare(bd);
  });

  // Mood counts for the header.
  const moodCounts: Record<CurioTag, number> = { color: 0, funny: 0, poignant: 0, ironic: 0 };
  for (const s of curioSources) {
    for (const m of CURIO_TAGS) if (s.tags.includes(m)) moodCounts[m]++;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-stone-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-stone-900">Curio cabinet</h1>
        <p className="mt-2 text-sm text-stone-600">
          {curioSources.length} clipping
          {curioSources.length === 1 ? '' : 's'} tagged for period
          texture, atmosphere, or oddity. The kind of thing the book
          reaches for when it wants to set a scene, not when it&apos;s
          building an argument.
        </p>
        <p className="mt-2 text-xs text-stone-500">
          Color: {moodCounts.color} · Funny: {moodCounts.funny} ·
          Poignant: {moodCounts.poignant} · Ironic: {moodCounts.ironic}
        </p>
      </header>

      {curioSources.length === 0 ? (
        <p className="text-sm text-stone-500">
          No curio-tagged clippings yet. Tag a clipping with{' '}
          <code>color</code>, <code>funny</code>, <code>poignant</code>,
          or <code>ironic</code> in its metadata.yaml to surface it here.
        </p>
      ) : (
        <ul className="space-y-6">
          {curioSources.map(s => (
            <li key={s.id}>
              <CurioCard source={s} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function CurioCard({ source }: { source: Source }) {
  if (source.type !== 'clipping') return null;

  const moodTags = (source.tags ?? []).filter((t): t is CurioTag =>
    CURIO_TAGS.includes(t as CurioTag)
  );

  // Teaser: first 1–2 sentences of the summary, trimmed to ~280 chars
  // so the cabinet feed stays scannable.
  const teaser = teaserFrom(source.summary);

  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-300">
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <Link href={`/sources/${source.id}`} className="text-sm hover:underline">
          <span className="font-medium">{source.date ?? 'undated'}</span>
          <span className="ml-1 text-stone-600">
            — {source.newspaper}, p.{source.page}
          </span>
        </Link>
        <ul className="flex shrink-0 flex-wrap gap-1 text-xs">
          {moodTags.map(t => (
            <li
              key={t}
              className={`rounded px-1.5 py-0.5 ${moodClassName(t)}`}
            >
              {t}
            </li>
          ))}
        </ul>
      </header>

      {source.headline && (
        <h2 className="mb-1 text-base font-medium text-stone-900">
          {source.headline}
        </h2>
      )}

      <p className="text-sm leading-6 text-stone-700">{teaser}</p>

      <Link
        href={`/sources/${source.id}`}
        className="mt-2 inline-block text-xs text-stone-500 hover:text-stone-900 hover:underline"
      >
        Show the original →
      </Link>
    </article>
  );
}

function teaserFrom(summary: string, maxChars = 280): string {
  const s = summary.trim();
  if (!s) return '(no summary)';
  // Pull the first sentence(s) up to maxChars.
  const sentences = s.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const sent of sentences) {
    if ((out + ' ' + sent).length > maxChars) break;
    out = (out + ' ' + sent).trim();
  }
  if (!out) out = s.slice(0, maxChars);
  if (out.length < s.length) out += '…';
  return out;
}

function moodClassName(mood: CurioTag): string {
  switch (mood) {
    case 'color':
      return 'bg-amber-100 text-amber-900';
    case 'funny':
      return 'bg-yellow-100 text-yellow-900';
    case 'poignant':
      return 'bg-rose-100 text-rose-900';
    case 'ironic':
      return 'bg-violet-100 text-violet-900';
  }
}
