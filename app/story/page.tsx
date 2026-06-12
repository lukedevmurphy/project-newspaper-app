// Story index — one card per storyboard subject. Subjects are a
// curated allowlist (lib/story/subjects.ts), not the is_book_subject
// flag; see the comment there.

import Link from 'next/link';
import { loadArchive } from '@/lib/data';
import { deriveChapters } from '@/lib/story/chapters';
import { getStorySubjects } from '@/lib/story/subjects';

export default function StoryIndexPage() {
  const archive = loadArchive();
  const subjects = getStorySubjects(archive);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Story</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Life storyboards for the book&apos;s subjects — chapters derived from
          citation-backed residences and dated sources, with the era&apos;s
          history interleaved.
        </p>
      </header>

      <ul className="space-y-4">
        {subjects.map(person => {
          const chapters = deriveChapters(archive, person);
          const sourceCount = chapters.reduce(
            (sum, ch) => sum + ch.sourceGroups.reduce((s, g) => s + g.sourceIds.length, 0),
            0
          );
          const lifespan = [
            person.birth.date ? `b. ${person.birth.date}` : null,
            person.death.date ? `d. ${person.death.date}` : null,
          ]
            .filter(Boolean)
            .join(' — ');
          return (
            <li key={person.id}>
              <Link
                href={`/story/${person.id}`}
                className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-400"
              >
                <h2 className="text-base font-medium text-zinc-900">
                  {person.display_name.split('(')[0].trim()}
                </h2>
                {lifespan && <p className="mt-0.5 text-sm text-zinc-600">{lifespan}</p>}
                <p className="mt-1 text-xs text-zinc-500">
                  {chapters.length} chapters · {sourceCount} sources
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
