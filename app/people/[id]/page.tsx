// Person detail page. Lists every source that links to this person,
// grouped by the per-source link confidence (NOT the person's overall
// family_confidence — same person can be linked from different sources
// at different confidence levels).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadArchive } from '@/lib/data';
import type { Archive, Clipping, PersonLink, PersonRecord, Source } from '@/lib/data';

type Params = { id: string };

export function generateStaticParams(): Params[] {
  const archive = loadArchive();
  return archive.people.map(p => ({ id: p.id }));
}

export default async function PersonPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const archive = loadArchive();
  const person = archive.peopleById.get(id);
  if (!person) notFound();

  const linkedSourceIds = archive.sourcesByPersonId.get(id) ?? [];
  const linkedSources = linkedSourceIds
    .map(sid => archive.sourcesById.get(sid))
    .filter((s): s is Source => !!s);

  const bands = bandLinks(linkedSources, id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
        <span className="mx-2">/</span>
        <Link href="/people" className="hover:underline">
          People
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">{person.display_name}</h1>
        {person.also_known_as.length > 0 && (
          <p className="mt-2 text-sm text-zinc-500">
            Also known as: {person.also_known_as.join(', ')}
          </p>
        )}
        <p className="mt-3">
          <PersonFamilyBadge value={person.family_confidence} />
        </p>
        {person.disambiguation && (
          <p className="mt-4 whitespace-pre-line text-sm text-zinc-700">
            {person.disambiguation}
          </p>
        )}
      </header>

      <PersonFacts person={person} archive={archive} />

      <PersonRelationships person={person} archive={archive} />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Sources linking to this person
        </h2>
        {linkedSources.length === 0 ? (
          <p className="text-sm text-zinc-500">No sources yet link to this person.</p>
        ) : (
          <>
            <ConfidenceBand
              title="≥75 — High confidence"
              entries={bands.high}
            />
            <ConfidenceBand
              title="25–74 — Candidates"
              entries={bands.candidates}
            />
            <ConfidenceBand
              title="<25 — Namesake / flag / context"
              entries={bands.weak}
            />
          </>
        )}
      </section>

      {person.family_notes && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Family notes (private; from people.yaml)
          </h2>
          <p className="whitespace-pre-line text-sm text-zinc-700">
            {person.family_notes}
          </p>
        </section>
      )}

      <footer className="mt-12 border-t border-zinc-200 pt-6 text-xs text-zinc-500">
        <p>
          Person ID: <code className="rounded bg-zinc-100 px-1 py-0.5">{person.id}</code>
        </p>
      </footer>
    </main>
  );
}

function bandLinks(sources: Source[], personId: string): {
  high: Array<{ source: Source; link: PersonLink }>;
  candidates: Array<{ source: Source; link: PersonLink }>;
  weak: Array<{ source: Source; link: PersonLink }>;
} {
  const high: Array<{ source: Source; link: PersonLink }> = [];
  const candidates: Array<{ source: Source; link: PersonLink }> = [];
  const weak: Array<{ source: Source; link: PersonLink }> = [];

  for (const source of sources) {
    const link = source.people.find(p => p.id === personId);
    if (!link) continue;
    const c = link.confidence_is_my_family;
    const entry = { source, link };
    if (c >= 75) high.push(entry);
    else if (c >= 25) candidates.push(entry);
    else weak.push(entry);
  }

  const byDate = (a: { source: Source }, b: { source: Source }) => {
    const ad = a.source.date ?? '';
    const bd = b.source.date ?? '';
    return ad.localeCompare(bd);
  };
  high.sort(byDate);
  candidates.sort(byDate);
  weak.sort(byDate);

  return { high, candidates, weak };
}

function ConfidenceBand({
  title,
  entries,
}: {
  title: string;
  entries: Array<{ source: Source; link: PersonLink }>;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-700">
        {title} — {entries.length}
      </h3>
      <ul className="space-y-2">
        {entries.map(({ source, link }, i) => (
          <li
            key={`${source.id}-${i}`}
            className="border-l-2 border-zinc-200 pl-3"
          >
            <SourceRowLink source={source} link={link} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceRowLink({ source, link }: { source: Source; link: PersonLink }) {
  if (source.type === 'clipping') {
    return (
      <div className="text-sm">
        <Link href={`/sources/${source.id}`} className="font-medium hover:underline">
          {source.date ?? 'undated'} — {source.newspaper}, p.{source.page}
        </Link>
        {source.headline && (
          <span className="ml-2 text-zinc-700">{source.headline}</span>
        )}
        <div className="text-xs text-zinc-500">
          {link.role_in_story && <span>role: {link.role_in_story} · </span>}
          confidence on this source: {link.confidence_is_my_family}
          {link.name_as_printed && (
            <span> · as printed: {link.name_as_printed}</span>
          )}
        </div>
      </div>
    );
  }
  return null;
}

function PersonFacts({
  person,
  archive,
}: {
  person: PersonRecord;
  archive: Archive;
}) {
  const hasBirth = person.birth.date || person.birth.place;
  const hasDeath = person.death.date || person.death.place;
  const residence = person.primary_residence
    ? archive.placesById.get(person.primary_residence)
    : null;
  if (!hasBirth && !hasDeath && !residence && (!person.affiliations || person.affiliations.length === 0)) {
    return null;
  }
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Facts
      </h2>
      <dl className="space-y-1 text-sm text-zinc-700">
        {hasBirth && (
          <div>
            <dt className="inline font-medium">Birth: </dt>
            <dd className="inline">
              {person.birth.date ?? 'unknown date'}
              {person.birth.place && `, ${person.birth.place}`}
              {person.birth.confidence < 95 && person.birth.confidence > 0 && (
                <span className="text-zinc-500">
                  {' '}
                  (date confidence: {person.birth.confidence})
                </span>
              )}
            </dd>
          </div>
        )}
        {hasDeath && (
          <div>
            <dt className="inline font-medium">Death: </dt>
            <dd className="inline">
              {person.death.date ?? 'unknown date'}
              {person.death.place && `, ${archive.placesById.get(person.death.place)?.display ?? person.death.place}`}
              {person.death.confidence < 95 && person.death.confidence > 0 && (
                <span className="text-zinc-500">
                  {' '}
                  (date confidence: {person.death.confidence})
                </span>
              )}
            </dd>
          </div>
        )}
        {residence && (
          <div>
            <dt className="inline font-medium">Residence: </dt>
            <dd className="inline">
              <Link
                href={`/places/${residence.id}`}
                className="hover:underline"
              >
                {residence.display}
              </Link>
            </dd>
          </div>
        )}
        {person.affiliations && person.affiliations.length > 0 && (
          <div>
            <dt className="inline font-medium">Affiliations: </dt>
            <dd className="inline">{person.affiliations.join(', ')}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function PersonRelationships({
  person,
  archive,
}: {
  person: PersonRecord;
  archive: Archive;
}) {
  if (person.relationships.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Relationships
      </h2>
      <ul className="space-y-1 text-sm text-zinc-700">
        {person.relationships.map((rel, i) => {
          const target = archive.peopleById.get(rel.person);
          return (
            <li key={`${rel.relation}-${rel.person}-${i}`}>
              {rel.relation.replace(/_/g, ' ')}{' '}
              {target ? (
                <Link
                  href={`/people/${rel.person}`}
                  className="font-medium hover:underline"
                >
                  {target.display_name}
                </Link>
              ) : (
                <span className="text-zinc-500">{rel.person} (unresolved)</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PersonFamilyBadge({ value }: { value: number }) {
  let label = '';
  let color = '';
  if (value >= 95) {
    label = `${value} — certain (corroborated)`;
    color = 'bg-emerald-100 text-emerald-900';
  } else if (value >= 75) {
    label = `${value} — strong`;
    color = 'bg-emerald-50 text-emerald-800';
  } else if (value >= 25) {
    label = `${value} — candidate (user review)`;
    color = 'bg-amber-100 text-amber-900';
  } else if (value >= 10) {
    label = `${value} — flag`;
    color = 'bg-zinc-100 text-zinc-700';
  } else {
    label = '0 — not family / context';
    color = 'bg-zinc-100 text-zinc-500';
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${color}`}>
      family confidence: {label}
    </span>
  );
}
