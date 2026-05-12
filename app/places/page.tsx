import Link from 'next/link';
import { loadArchive } from '@/lib/data';

export default function AllPlacesPage() {
  const archive = loadArchive();

  const rows = archive.places
    .map(p => ({
      ...p,
      count: archive.sourcesByPlaceId.get(p.id)?.length ?? 0,
    }))
    .sort((a, b) => a.display.localeCompare(b.display));

  // Roots first (parent: null), then nested. For now just alphabetical;
  // the hierarchy is rendered on the individual place pages.
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">All places</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {archive.places.length} places.
        </p>
      </header>
      <ul className="space-y-1.5 text-sm">
        {rows.map(p => (
          <li key={p.id} className="flex items-baseline justify-between gap-3">
            <Link
              href={`/places/${p.id}`}
              className={p.count > 0 ? 'hover:underline' : 'text-zinc-400 hover:underline'}
            >
              {p.display}
              {p.parent && (
                <span className="ml-2 text-xs text-zinc-500">
                  in {archive.placesById.get(p.parent)?.display ?? p.parent}
                </span>
              )}
            </Link>
            <span className="text-xs text-zinc-500">
              {p.count} source{p.count === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
