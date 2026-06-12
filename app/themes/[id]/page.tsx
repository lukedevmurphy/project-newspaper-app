import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadArchive } from '@/lib/data';
import { SourceList } from '@/components/source-list';

type Params = { id: string };

export function generateStaticParams(): Params[] {
  const archive = loadArchive();
  return archive.themes.map(t => ({ id: t }));
}

export default async function ThemePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const archive = loadArchive();

  if (!archive.themes.includes(id)) notFound();

  const sourceIds = archive.sourcesByTheme.get(id) ?? [];
  const sources = sourceIds
    .map(sid => archive.sourcesById.get(sid))
    .filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-stone-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
        <span className="mx-2">/</span>
        <Link href="/themes" className="hover:underline">
          Themes
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-stone-900">
          Theme: <code className="rounded bg-stone-100 px-2 py-0.5 text-xl">{id}</code>
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          {sources.length} source{sources.length === 1 ? '' : 's'}.
        </p>
      </header>

      <SourceList sources={sources} />
    </main>
  );
}
