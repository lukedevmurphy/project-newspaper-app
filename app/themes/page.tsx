import Link from 'next/link';
import { loadArchive } from '@/lib/data';

export default function AllThemesPage() {
  const archive = loadArchive();

  const rows = archive.themes
    .map(t => ({
      t,
      count: archive.sourcesByTheme.get(t)?.length ?? 0,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.t.localeCompare(b.t);
    });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">All themes</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {archive.themes.length} themes declared; {rows.filter(r => r.count > 0).length} in use.
        </p>
      </header>
      <ul className="space-y-1.5 text-sm">
        {rows.map(r => (
          <li key={r.t} className="flex items-baseline justify-between gap-3">
            <Link
              href={`/themes/${r.t}`}
              className={r.count > 0 ? 'hover:underline' : 'text-zinc-400 hover:underline'}
            >
              {r.t}
            </Link>
            <span className="text-xs text-zinc-500">
              {r.count} source{r.count === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
