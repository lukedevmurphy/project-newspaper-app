// Sorted-by-date list of sources, each row a link to the source detail
// page. Used on theme / place / thread / timeline pages.

import Link from 'next/link';
import { sourceListing } from '@/lib/data';
import type { Source } from '@/lib/data';

export function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) {
    return <p className="text-sm text-stone-500">No sources.</p>;
  }
  const sorted = [...sources].sort((a, b) => {
    const ad = a.date ?? '';
    const bd = b.date ?? '';
    return ad.localeCompare(bd);
  });
  return (
    <ul className="space-y-3">
      {sorted.map(source => (
        <li key={source.id} className="border-l-2 border-stone-200 pl-3">
          <SourceRow source={source} />
        </li>
      ))}
    </ul>
  );
}

function SourceRow({ source }: { source: Source }) {
  const { title, citation } = sourceListing(source);
  return (
    <div className="text-sm">
      <Link href={`/sources/${source.id}`} className="font-medium hover:underline">
        {citation}
      </Link>
      {title && (
        <span className="ml-2 text-stone-700">{title}</span>
      )}
      {source.summary && (
        <p className="mt-0.5 text-xs text-stone-600">
          {source.summary.slice(0, 160)}
          {source.summary.length > 160 && '…'}
        </p>
      )}
    </div>
  );
}
