import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadArchive } from '@/lib/data';
import { SourceList } from '@/components/source-list';

type Params = { id: string };

export function generateStaticParams(): Params[] {
  const archive = loadArchive();
  return archive.threads.map(t => ({ id: t.id }));
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const archive = loadArchive();
  const thread = archive.threadsById.get(id);
  if (!thread) notFound();

  const sourceIds = archive.sourcesByThread.get(id) ?? [];
  const sources = sourceIds
    .map(sid => archive.sourcesById.get(sid))
    .filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">{thread.display}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {sources.length} source{sources.length === 1 ? '' : 's'}.
        </p>
        {thread.description && (
          <p className="mt-3 whitespace-pre-line text-sm text-zinc-700">
            {thread.description}
          </p>
        )}
      </header>

      <SourceList sources={sources} />
    </main>
  );
}
