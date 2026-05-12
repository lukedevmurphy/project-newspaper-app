// All sources in chronological order, grouped by decade.

import Link from 'next/link';
import { loadArchive } from '@/lib/data';
import type { Source } from '@/lib/data';

export default function TimelinePage() {
  const archive = loadArchive();
  const sources = [...archive.sources].sort((a, b) => {
    const ad = a.date ?? '';
    const bd = b.date ?? '';
    return ad.localeCompare(bd);
  });

  const byDecade = new Map<string, Source[]>();
  for (const src of sources) {
    const decade = src.date ? `${src.date.slice(0, 3)}0s` : 'undated';
    const bucket = byDecade.get(decade) ?? [];
    bucket.push(src);
    byDecade.set(decade, bucket);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Timeline</h1>
        <p className="mt-2 text-sm text-zinc-600">
          All {sources.length} sources in chronological order.
        </p>
      </header>

      {[...byDecade.entries()].map(([decade, items]) => (
        <section key={decade} className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-zinc-800">
            {decade}{' '}
            <span className="text-sm font-normal text-zinc-500">
              ({items.length})
            </span>
          </h2>
          <ul className="space-y-2">
            {items.map(src => (
              <li key={src.id} className="border-l-2 border-zinc-200 pl-3 text-sm">
                <TimelineRow source={src} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

function TimelineRow({ source }: { source: Source }) {
  if (source.type === 'clipping') {
    return (
      <div>
        <Link href={`/sources/${source.id}`} className="font-medium hover:underline">
          {source.date ?? 'undated'} — {source.newspaper}, p.{source.page}
        </Link>
        {source.headline && <span className="ml-2 text-zinc-700">{source.headline}</span>}
        {source.summary && (
          <p className="mt-0.5 text-xs text-zinc-600">
            {source.summary.slice(0, 140)}
            {source.summary.length > 140 && '…'}
          </p>
        )}
      </div>
    );
  }
  return null;
}
