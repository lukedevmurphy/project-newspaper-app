// Substring search across person names + aliases, place names +
// variants, theme labels, source headlines + summaries.
// "Dumb-but-fast" — full linear scan over the in-memory archive.
// For 29 sources / a few thousand sources this is instant.

import Link from 'next/link';
import { loadArchive, sourceListing } from '@/lib/data';
import type { Archive, DocumentPersonLink, Source } from '@/lib/data';

type SearchParams = { q?: string };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q = '' } = await searchParams;
  const query = q.trim();
  const archive = loadArchive();

  if (!query) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <nav className="mb-6 text-sm text-zinc-500">
          <Link href="/" className="hover:underline">
            ← Archive
          </Link>
        </nav>
        <h1 className="mb-4 text-2xl font-semibold">Search</h1>
        <form action="/search">
          <input
            type="search"
            name="q"
            placeholder="Search..."
            className="w-full rounded-md border border-zinc-300 px-4 py-3 text-base"
            autoFocus
          />
        </form>
      </main>
    );
  }

  const results = runSearch(archive, query);
  const totalResults =
    results.people.length +
    results.places.length +
    results.themes.length +
    results.mentioned.length +
    results.sources.length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>

      <header className="mb-8">
        <form action="/search">
          <input
            type="search"
            name="q"
            defaultValue={query}
            className="w-full rounded-md border border-zinc-300 px-4 py-3 text-base"
            autoFocus
          />
        </form>
        <p className="mt-3 text-sm text-zinc-600">
          {totalResults} result{totalResults === 1 ? '' : 's'} for{' '}
          <strong>&ldquo;{query}&rdquo;</strong>
        </p>
      </header>

      {results.people.length > 0 && (
        <SearchSection title={`People (${results.people.length})`}>
          {results.people.map(({ id, person, matchedAlias }) => (
            <li key={id} className="border-l-2 border-zinc-200 pl-3">
              <Link
                href={`/people/${id}`}
                className="font-medium hover:underline"
              >
                {person.display_name}
              </Link>
              {matchedAlias && matchedAlias !== person.display_name && (
                <span className="ml-2 text-sm text-zinc-500">
                  (matched: {matchedAlias})
                </span>
              )}
              <span className="ml-2 text-xs text-zinc-500">
                family confidence: {person.family_confidence}
              </span>
              {person.disambiguation && (
                <p className="mt-0.5 text-sm text-zinc-600">
                  {firstLine(person.disambiguation)}
                </p>
              )}
            </li>
          ))}
        </SearchSection>
      )}

      {results.mentioned.length > 0 && (
        <SearchSection
          title={`Mentioned-only names (${results.mentioned.length})`}
          subtitle="Names that appear in sources but are not in the person registry."
        >
          {results.mentioned.map(({ name, hits }) => (
            <li key={name} className="border-l-2 border-zinc-200 pl-3">
              <div className="font-medium">{name}</div>
              <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                {hits.slice(0, 5).map((hit, i) => {
                  const src = archive.sourcesById.get(hit.sourceId);
                  if (!src) return null;
                  return (
                    <li key={i}>
                      <Link
                        href={`/sources/${hit.sourceId}`}
                        className="hover:underline"
                      >
                        {sourceListing(src).citation}
                      </Link>
                      {hit.mention.role_in_story && (
                        <span> ({hit.mention.role_in_story})</span>
                      )}
                    </li>
                  );
                })}
                {hits.length > 5 && (
                  <li className="text-zinc-500">
                    …and {hits.length - 5} more
                  </li>
                )}
              </ul>
            </li>
          ))}
        </SearchSection>
      )}

      {results.places.length > 0 && (
        <SearchSection title={`Places (${results.places.length})`}>
          {results.places.map(({ id, place, matchedVariant }) => (
            <li key={id} className="border-l-2 border-zinc-200 pl-3">
              <Link
                href={`/places/${id}`}
                className="font-medium hover:underline"
              >
                {place.display}
              </Link>
              {matchedVariant && matchedVariant !== place.display && (
                <span className="ml-2 text-sm text-zinc-500">
                  (matched: {matchedVariant})
                </span>
              )}
            </li>
          ))}
        </SearchSection>
      )}

      {results.themes.length > 0 && (
        <SearchSection title={`Themes (${results.themes.length})`}>
          {results.themes.map(t => (
            <li key={t} className="border-l-2 border-zinc-200 pl-3">
              <Link href={`/themes/${t}`} className="font-medium hover:underline">
                {t}
              </Link>
            </li>
          ))}
        </SearchSection>
      )}

      {results.sources.length > 0 && (
        <SearchSection title={`Sources (${results.sources.length})`}>
          {results.sources.map(({ source, where }) => (
            <li key={source.id} className="border-l-2 border-zinc-200 pl-3">
              <SourceSearchRow source={source} matchedIn={where} query={query} />
            </li>
          ))}
        </SearchSection>
      )}

      {totalResults === 0 && (
        <p className="text-sm text-zinc-500">
          No results. Try a shorter substring or a different name.
        </p>
      )}
    </main>
  );
}

// ---- Search ----------------------------------------------------------

interface PersonHit {
  id: string;
  person: Archive['people'][number];
  matchedAlias?: string;
}
interface PlaceHit {
  id: string;
  place: Archive['places'][number];
  matchedVariant?: string;
}
interface MentionedHit {
  name: string;
  hits: Array<{ sourceId: string; mention: Source['mentioned'][number] }>;
}
interface SourceHit {
  source: Source;
  where: Array<'headline' | 'summary' | 'transcription' | 'dateline' | 'people_as_printed'>;
}

// Document people carry *_as_printed fields (census household members,
// directory entries) — searchable so household names surface even when
// they never appear in a headline or summary.
const SEARCHABLE_AS_PRINTED: (keyof DocumentPersonLink)[] = [
  'name_as_printed',
  'occupation_as_printed',
  'residence_as_printed',
  'birth_place_as_printed',
];

function runSearch(archive: Archive, query: string) {
  const q = query.toLowerCase();

  const people: PersonHit[] = [];
  for (const person of archive.people) {
    if (person.display_name.toLowerCase().includes(q)) {
      people.push({ id: person.id, person });
      continue;
    }
    const aliasMatch = person.also_known_as.find(a => a.toLowerCase().includes(q));
    if (aliasMatch) {
      people.push({ id: person.id, person, matchedAlias: aliasMatch });
    }
  }

  const places: PlaceHit[] = [];
  for (const place of archive.places) {
    if (place.display.toLowerCase().includes(q)) {
      places.push({ id: place.id, place });
      continue;
    }
    const variantMatch = place.variants.find(v => v.toLowerCase().includes(q));
    if (variantMatch) {
      places.push({ id: place.id, place, matchedVariant: variantMatch });
    }
  }

  const themes = archive.themes.filter(t => t.toLowerCase().includes(q));

  // Mentioned-only names: search across all clippings' mentioned lists.
  const mentionedByMatch = new Map<string, MentionedHit>();
  for (const [nameKey, hits] of archive.mentionedByName.entries()) {
    if (nameKey.includes(q)) {
      const display = hits[0]?.mention.name_as_printed ?? nameKey;
      mentionedByMatch.set(nameKey, { name: display, hits });
    }
  }

  const sources: SourceHit[] = [];
  for (const source of archive.sources) {
    const where: SourceHit['where'] = [];
    if (source.headline.toLowerCase().includes(q)) where.push('headline');
    if (source.summary.toLowerCase().includes(q)) where.push('summary');
    if (source.type === 'clipping' && source.dateline.toLowerCase().includes(q)) where.push('dateline');
    if (source.transcription.toLowerCase().includes(q)) where.push('transcription');
    if (source.type === 'document') {
      const hit = source.people.some(p =>
        SEARCHABLE_AS_PRINTED.some(f => String(p[f] ?? '').toLowerCase().includes(q))
      );
      if (hit) where.push('people_as_printed');
    }
    if (where.length > 0) sources.push({ source, where });
  }

  // Sort source hits by date (newest first), then by where (headline beats summary beats transcription)
  sources.sort((a, b) => {
    const ad = a.source.date ?? '';
    const bd = b.source.date ?? '';
    return ad.localeCompare(bd);
  });

  return {
    people,
    places,
    themes,
    mentioned: [...mentionedByMatch.values()],
    sources,
  };
}

function SearchSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      {subtitle && <p className="mb-2 text-xs text-zinc-500">{subtitle}</p>}
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function SourceSearchRow({
  source,
  matchedIn,
  query,
}: {
  source: Source;
  matchedIn: SourceHit['where'];
  query: string;
}) {
  const { title, citation } = sourceListing(source);
  return (
    <div className="text-sm">
      <Link href={`/sources/${source.id}`} className="font-medium hover:underline">
        {citation}
      </Link>
      {title && (
        <span className="ml-2 text-zinc-700">{title}</span>
      )}
      <p className="mt-0.5 text-xs text-zinc-500">
        matched in: {matchedIn.join(', ')}
      </p>
      <p className="mt-1 text-sm text-zinc-700">
        {snippet(source.summary || source.transcription, query)}
      </p>
    </div>
  );
}

function snippet(text: string, query: string, before = 30, after = 60): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 120) + (text.length > 120 ? '…' : '');
  const start = Math.max(0, idx - before);
  const end = Math.min(text.length, idx + query.length + after);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ') + (end < text.length ? '…' : '');
}

function firstLine(s: string): string {
  return (s || '').trim().split('\n')[0];
}
