import Link from 'next/link';
import { loadArchive, sourceListing } from '@/lib/data';

export default function AllSourcesPage() {
  const archive = loadArchive();
  const sources = [...archive.sources].sort((a, b) => {
    const ad = a.date ?? '';
    const bd = b.date ?? '';
    return ad.localeCompare(bd);
  });
  const counts = archive.stats.sourcesByType;
  const countLine = Object.entries(counts)
    .map(([type, n]) => `${n} ${type}${n === 1 ? '' : 's'}`)
    .join(', ');

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">All sources</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {sources.length} sources ({countLine}), oldest first.
        </p>
      </header>
      <ul className="space-y-2">
        {sources.map(src => {
          const { title, citation } = sourceListing(src);
          return (
            <li key={src.id} className="border-l-2 border-zinc-200 pl-3 text-sm">
              <Link href={`/sources/${src.id}`} className="font-medium hover:underline">
                {citation}
              </Link>
              {title && (
                <span className="ml-2 text-zinc-700">{title}</span>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
