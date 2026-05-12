import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadArchive } from '@/lib/data';
import { SourceList } from '@/components/source-list';

type Params = { id: string };

export function generateStaticParams(): Params[] {
  const archive = loadArchive();
  return archive.places.map(p => ({ id: p.id }));
}

export default async function PlacePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const archive = loadArchive();
  const place = archive.placesById.get(id);
  if (!place) notFound();

  const directIds = archive.sourcesByPlaceId.get(id) ?? [];
  const directSources = directIds
    .map(sid => archive.sourcesById.get(sid))
    .filter((s): s is NonNullable<typeof s> => !!s);

  // Walk parent → ancestor chain for context.
  const ancestors: { id: string; display: string }[] = [];
  let cur = place.parent;
  while (cur) {
    const a = archive.placesById.get(cur);
    if (!a) break;
    ancestors.push({ id: a.id, display: a.display });
    cur = a.parent;
  }

  // Child places (places whose parent is this id).
  const children = archive.places.filter(p => p.parent === id);

  // Roll-up: sources that appear under child places.
  const rollupIds = new Set<string>();
  for (const child of children) {
    for (const sid of archive.sourcesByPlaceId.get(child.id) ?? []) {
      if (!directIds.includes(sid)) rollupIds.add(sid);
    }
  }
  // (For deeper trees, we'd walk recursively; current data has only one or
  // two levels of nesting so this single hop is sufficient.)

  const rollupSources = [...rollupIds]
    .map(sid => archive.sourcesById.get(sid))
    .filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
        <span className="mx-2">/</span>
        <Link href="/places" className="hover:underline">
          Places
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">{place.display}</h1>
        {ancestors.length > 0 && (
          <p className="mt-2 text-sm text-zinc-600">
            Part of:{' '}
            {ancestors.map((a, i) => (
              <span key={a.id}>
                <Link href={`/places/${a.id}`} className="hover:underline">
                  {a.display}
                </Link>
                {i < ancestors.length - 1 && ' / '}
              </span>
            ))}
          </p>
        )}
        {place.variants.length > 0 && (
          <p className="mt-2 text-xs text-zinc-500">
            Also: {place.variants.join(', ')}
          </p>
        )}
        {place.notes && (
          <p className="mt-3 whitespace-pre-line text-sm text-zinc-700">
            {place.notes}
          </p>
        )}
      </header>

      {children.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Child places
          </h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {children.map(c => (
              <li key={c.id}>
                <Link href={`/places/${c.id}`} className="hover:underline">
                  {c.display}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Sources at this place ({directSources.length})
        </h2>
        <SourceList sources={directSources} />
      </section>

      {rollupSources.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Sources at child places ({rollupSources.length})
          </h2>
          <SourceList sources={rollupSources} />
        </section>
      )}
    </main>
  );
}
