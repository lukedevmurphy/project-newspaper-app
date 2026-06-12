// Person detail page. Lists every source that links to this person,
// grouped by the per-source link confidence (NOT the person's overall
// family_confidence — same person can be linked from different sources
// at different confidence levels).

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadArchive, sourceListing } from '@/lib/data';
import type { Archive, Clipping, PersonLink, PersonRecord, Source } from '@/lib/data';
import Image from 'next/image';
import { photoUrl } from '@/lib/data';
import { EgoNetwork } from '@/components/ego-network';
import { isStorySubject } from '@/lib/story/subjects';

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
        <PersonPortrait person={person} archive={archive} />
        <h1 className="text-2xl font-semibold text-zinc-900">{person.display_name}</h1>
        {person.also_known_as.length > 0 && (
          <p className="mt-2 text-sm text-zinc-500">
            Also known as: {person.also_known_as.join(', ')}
          </p>
        )}
        <p className="mt-3">
          <PersonFamilyBadge value={person.family_confidence} />
        </p>
        {isStorySubject(person.id) && (
          <p className="mt-3 text-sm">
            <Link href={`/story/${person.id}`} className="font-medium hover:underline">
              Read this person&apos;s storyboard →
            </Link>
          </p>
        )}
        {person.disambiguation && (
          <p className="mt-4 whitespace-pre-line text-sm text-zinc-700">
            {person.disambiguation}
          </p>
        )}
      </header>

      <PersonFacts person={person} archive={archive} />

      <PersonRelationships person={person} archive={archive} />

      <EgoNetwork person={person} archive={archive} />

      <PersonCoAppearances person={person} archive={archive} />

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
  const { title, citation } = sourceListing(source);
  return (
    <div className="text-sm">
      <Link href={`/sources/${source.id}`} className="font-medium hover:underline">
        {citation}
      </Link>
      {title && (
        <span className="ml-2 text-zinc-700">{title}</span>
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

// Header portrait — the first confirmed photo for this person, served
// from the external image bucket. Renders nothing when no confirmed
// photo exists or NEXT_PUBLIC_IMAGE_BASE_URL is unset.
function PersonPortrait({ person, archive }: { person: PersonRecord; archive: Archive }) {
  const photo = (archive.photosByPersonId.get(person.id) ?? [])
    .find(p => p.kind === 'face_crop' || p.kind === 'portrait')
    ?? archive.photosByPersonId.get(person.id)?.[0];
  if (!photo) return null;
  const url = photoUrl(photo);
  if (!url) return null;
  const candidate = photo.person_candidates.find(c => c.person_id === person.id);
  return (
    <figure className="float-right ml-6 mb-4 w-36">
      <Image
        src={url}
        alt={photo.caption_as_printed ?? person.display_name}
        width={288}
        height={360}
        className="rounded border border-zinc-200"
      />
      <figcaption className="mt-1 text-xs text-zinc-500">
        {photo.caption_as_printed && <span className="italic">&ldquo;{photo.caption_as_printed}&rdquo; </span>}
        {photo.page_id && (
          <Link href={`/pages/${photo.page_id}`} className="hover:underline">
            from {photo.page_id}
          </Link>
        )}
        {candidate && <span> · identification confidence {candidate.confidence}</span>}
        {photo.sources.length > 0 && (
          <span>
            {' · '}
            {photo.sources.map((sid, i) => (
              <span key={sid}>
                {i > 0 && ', '}
                <Link href={`/sources/${sid}`} className="hover:underline">source</Link>
              </span>
            ))}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function PersonRelationships({
  person,
  archive,
}: {
  person: PersonRecord;
  archive: Archive;
}) {
  const resolved = archive.relationshipsByPersonId.get(person.id) ?? [];
  if (resolved.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Relationships
      </h2>
      <ul className="space-y-1 text-sm text-zinc-700">
        {resolved.map((rel, i) => {
          const target = archive.peopleById.get(rel.person);
          const name = target ? (
            <Link
              href={`/people/${rel.person}`}
              className="font-medium hover:underline"
            >
              {target.display_name}
            </Link>
          ) : (
            <span className="text-zinc-500">{rel.person} (unresolved)</span>
          );
          return (
            <li key={`${rel.relation}-${rel.person}-${i}`}>
              {rel.inverted ? (
                // No safe inverse exists — report the other person's
                // declaration rather than asserting a relation.
                <>
                  listed as <em>{rel.relation.replace(/_/g, ' ')}</em> this person by {name}
                </>
              ) : (
                <>
                  {rel.relation.replace(/_/g, ' ')} {name}
                </>
              )}
              {rel.inferred && (
                <span
                  className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500"
                  title={`Inferred from ${rel.declaredBy}'s entry`}
                >
                  inferred
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// "Appears with" — other people sharing concrete sources with this
// person. Every count is the length of the source array it expands to.
function PersonCoAppearances({
  person,
  archive,
}: {
  person: PersonRecord;
  archive: Archive;
}) {
  const co = archive.coAppearancesByPersonId.get(person.id);
  if (!co || co.size === 0) return null;
  const rows = [...co.entries()]
    .sort((a, b) => b[1].length - a[1].length);
  const shown = rows.slice(0, 15);
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Appears with
      </h2>
      <ul className="space-y-2 text-sm">
        {shown.map(([otherId, sourceIds]) => {
          const other = archive.peopleById.get(otherId);
          return (
            <li key={otherId} className="border-l-2 border-zinc-200 pl-3">
              <Link href={`/people/${otherId}`} className="font-medium hover:underline">
                {other?.display_name ?? otherId}
              </Link>
              <span className="ml-2 text-zinc-500">
                {sourceIds.length} shared source{sourceIds.length === 1 ? '' : 's'}
              </span>
              <ul className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-600">
                {sourceIds.map(sid => {
                  const src = archive.sourcesById.get(sid);
                  return (
                    <li key={sid}>
                      <Link href={`/sources/${sid}`} className="hover:underline">
                        {src ? sourceListing(src).citation : sid}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
        {rows.length > shown.length && (
          <li className="text-xs text-zinc-500">
            …and {rows.length - shown.length} more people with shared sources.
          </li>
        )}
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
