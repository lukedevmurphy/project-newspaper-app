// Sorted-by-date list of sources, each row a link to the source detail
// page. Used on theme / place / thread / timeline pages.

import Link from 'next/link';
import type { Source } from '@/lib/data';

export function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) {
    return <p className="text-sm text-zinc-500">No sources.</p>;
  }
  const sorted = [...sources].sort((a, b) => {
    const ad = a.date ?? '';
    const bd = b.date ?? '';
    return ad.localeCompare(bd);
  });
  return (
    <ul className="space-y-3">
      {sorted.map(source => (
        <li key={source.id} className="border-l-2 border-zinc-200 pl-3">
          <SourceRow source={source} />
        </li>
      ))}
    </ul>
  );
}

function SourceRow({ source }: { source: Source }) {
  if (source.type === 'clipping') {
    return (
      <div className="text-sm">
        <Link href={`/sources/${source.id}`} className="font-medium hover:underline">
          {source.date ?? 'undated'} — {source.newspaper}, p.{source.page}
        </Link>
        {source.headline && (
          <span className="ml-2 text-zinc-700">{source.headline}</span>
        )}
        {source.summary && (
          <p className="mt-0.5 text-xs text-zinc-600">
            {source.summary.slice(0, 160)}
            {source.summary.length > 160 && '…'}
          </p>
        )}
      </div>
    );
  }
  return null;
}
