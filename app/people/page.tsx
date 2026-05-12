import Link from 'next/link';
import { loadArchive } from '@/lib/data';

export default function AllPeoplePage() {
  const archive = loadArchive();

  // Sort by family_confidence band desc, then by source count desc, then by name.
  const rows = archive.people
    .map(p => ({
      ...p,
      count: archive.sourcesByPersonId.get(p.id)?.length ?? 0,
    }))
    .sort((a, b) => {
      if (b.family_confidence !== a.family_confidence) {
        return b.family_confidence - a.family_confidence;
      }
      if (b.count !== a.count) return b.count - a.count;
      return a.display_name.localeCompare(b.display_name);
    });

  // Group by confidence band for the index view.
  const bands: Array<{ label: string; rows: typeof rows }> = [
    { label: '≥75 — High confidence (likely family)', rows: rows.filter(r => r.family_confidence >= 75) },
    { label: '25–74 — Candidates (flagged for review)', rows: rows.filter(r => r.family_confidence >= 25 && r.family_confidence < 75) },
    { label: '<25 — Namesakes / context (not family)', rows: rows.filter(r => r.family_confidence < 25) },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">All people</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {archive.people.length} people, grouped by family_confidence band.
        </p>
      </header>

      {bands.map(band => (
        <section key={band.label} className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {band.label} ({band.rows.length})
          </h2>
          {band.rows.length === 0 ? (
            <p className="text-sm text-zinc-500">(none)</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {band.rows.map(p => (
                <li key={p.id} className="flex items-baseline justify-between gap-3">
                  <div>
                    <Link
                      href={`/people/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.display_name}
                    </Link>
                    <span className="ml-2 text-xs text-zinc-500">
                      conf {p.family_confidence}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {p.count} source{p.count === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}
