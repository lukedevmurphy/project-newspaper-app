// Home page. Search box + top people / places / themes by source count.
// Every count and every link here resolves to a source detail page —
// that's the source-attribution rule operationalised.

import Link from 'next/link';
import { loadArchive } from '@/lib/data';

export default function Home() {
  const archive = loadArchive();
  const s = archive.stats;

  const topPeople = [...archive.peopleById.entries()]
    .map(([id, p]) => ({
      id,
      name: p.display_name,
      count: archive.sourcesByPersonId.get(id)?.length ?? 0,
      family_confidence: p.family_confidence,
    }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count || b.family_confidence - a.family_confidence)
    .slice(0, 15);

  const topPlaces = [...archive.placesById.entries()]
    .map(([id, p]) => ({
      id,
      display: p.display,
      count: archive.sourcesByPlaceId.get(id)?.length ?? 0,
    }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const topThemes = archive.themes
    .map(t => ({ t, count: archive.sourcesByTheme.get(t)?.length ?? 0 }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const threadsWithCounts = archive.threads.map(t => ({
    id: t.id,
    display: t.display,
    count: archive.sourcesByThread.get(t.id)?.length ?? 0,
  }));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-zinc-900">
          Family newspaper archive
        </h1>
        <p className="mt-2 text-zinc-600">
          {s.totalSources} clippings, {s.totalPeople} people, {s.totalPlaces} places.{' '}
          {s.dateRange.earliest} to {s.dateRange.latest}.
        </p>
      </header>

      <form action="/search" className="mb-12">
        <input
          type="search"
          name="q"
          placeholder="Search names, places, themes, summaries..."
          className="w-full rounded-md border border-zinc-300 px-4 py-3 text-base focus:border-zinc-500 focus:outline-none"
          autoFocus
        />
      </form>

      <div className="grid gap-10 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Top people by source count
          </h2>
          <ul className="space-y-1.5 text-sm">
            {topPeople.map(p => (
              <li key={p.id} className="flex items-baseline justify-between gap-3">
                <Link
                  href={`/people/${p.id}`}
                  className="hover:underline"
                  title={`family_confidence: ${p.family_confidence}`}
                >
                  {p.name}
                </Link>
                <span className="text-xs text-zinc-500">
                  {p.count} source{p.count === 1 ? '' : 's'}
                  {p.family_confidence >= 75 && (
                    <span className="ml-1 text-emerald-700">★</span>
                  )}
                  {p.family_confidence >= 25 && p.family_confidence < 75 && (
                    <span className="ml-1 text-amber-700">?</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Top places by source count
          </h2>
          <ul className="space-y-1.5 text-sm">
            {topPlaces.map(p => (
              <li key={p.id} className="flex items-baseline justify-between gap-3">
                <Link href={`/places/${p.id}`} className="hover:underline">
                  {p.display}
                </Link>
                <span className="text-xs text-zinc-500">
                  {p.count} source{p.count === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Top themes
        </h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {topThemes.map(t => (
            <li key={t.t}>
              <Link
                href={`/themes/${t.t}`}
                className="rounded bg-zinc-100 px-2 py-1 hover:bg-zinc-200"
              >
                {t.t}{' '}
                <span className="text-xs text-zinc-500">({t.count})</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Story threads
        </h2>
        <ul className="space-y-1.5 text-sm">
          {threadsWithCounts.map(t => (
            <li key={t.id}>
              <Link href={`/threads/${t.id}`} className="hover:underline">
                {t.display}
              </Link>
              <span className="ml-2 text-xs text-zinc-500">
                {t.count} source{t.count === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 border-t border-zinc-200 pt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Browse all
        </h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <li>
            <Link href="/sources" className="hover:underline">
              All sources ({s.totalSources})
            </Link>
          </li>
          <li>
            <Link href="/people" className="hover:underline">
              All people ({s.totalPeople})
            </Link>
          </li>
          <li>
            <Link href="/places" className="hover:underline">
              All places ({s.totalPlaces})
            </Link>
          </li>
          <li>
            <Link href="/themes" className="hover:underline">
              All themes ({s.totalThemes})
            </Link>
          </li>
          <li>
            <Link href="/timeline-explorer" className="font-medium hover:underline">
              Timeline Explorer ✦
            </Link>
          </li>
          <li>
            <Link href="/timeline" className="hover:underline">
              Timeline (list)
            </Link>
          </li>
          <li>
            <Link href="/curio" className="font-medium hover:underline">
              Curio cabinet ✦
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
