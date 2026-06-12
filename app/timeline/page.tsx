// All sources in chronological order, grouped by decade. The ?type=
// filter keeps modern research artifacts (GEDCOM imports, oral-history
// emails) out of view when reading the newspaper record.

import Link from 'next/link';
import { loadArchive, sourceListing } from '@/lib/data';
import type { Source } from '@/lib/data';

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'clipping', label: 'Clippings' },
  { key: 'document', label: 'Documents' },
] as const;

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const activeType = TYPE_FILTERS.some(f => f.key === type) ? (type as string) : 'all';

  const archive = loadArchive();
  const sources = [...archive.sources]
    .filter(s => activeType === 'all' || s.type === activeType)
    .sort((a, b) => {
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
      <nav className="mb-6 text-sm text-stone-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-stone-900">Timeline</h1>
        <p className="mt-2 text-sm text-stone-600">
          All {sources.length} sources in chronological order.
        </p>
        <div className="mt-3 flex gap-2 text-sm">
          {TYPE_FILTERS.map(f => (
            <Link
              key={f.key}
              href={f.key === 'all' ? '/timeline' : `/timeline?type=${f.key}`}
              className={
                f.key === activeType
                  ? 'rounded-full bg-stone-800 px-3 py-0.5 text-white'
                  : 'rounded-full bg-stone-100 px-3 py-0.5 text-stone-600 hover:bg-stone-200'
              }
            >
              {f.label}
            </Link>
          ))}
        </div>
      </header>

      {[...byDecade.entries()].map(([decade, items]) => (
        <section key={decade} className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-stone-800">
            {decade}{' '}
            <span className="text-sm font-normal text-stone-500">
              ({items.length})
            </span>
          </h2>
          <ul className="space-y-2">
            {items.map(src => (
              <li key={src.id} className="border-l-2 border-stone-200 pl-3 text-sm">
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
  const { title, citation } = sourceListing(source);
  return (
    <div>
      <Link href={`/sources/${source.id}`} className="font-medium hover:underline">
        {citation}
      </Link>
      {title && <span className="ml-2 text-stone-700">{title}</span>}
      {source.summary && (
        <p className="mt-0.5 text-xs text-stone-600">
          {source.summary.slice(0, 140)}
          {source.summary.length > 140 && '…'}
        </p>
      )}
    </div>
  );
}
