// Storyboard: a life in chapters, woven from primary sources. Chapters
// come from lib/story/chapters.ts (residence spine or decade fallback);
// card prose reuses the AI clipping summaries where cached, falling
// back to the archivist's summary. Server-rendered, no client JS.
//
// Attribution rule: every number on this page is the length of an
// array whose members render as links right below it.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadAiChapterNarrative, loadAiClippingSummary, loadArchive, sourceListing } from '@/lib/data';
import type { Archive, PersonRecord, Source } from '@/lib/data';
import { deriveChapters, type StoryChapter } from '@/lib/story/chapters';
import { STORY_SUBJECT_IDS, isStorySubject } from '@/lib/story/subjects';
import { PersonAvatar } from '@/components/avatar';

type Params = { personId: string };

const VISIBLE_GROUPS = 8; // card groups shown before the <details> fold

export function generateStaticParams(): Params[] {
  return STORY_SUBJECT_IDS.map(personId => ({ personId }));
}

export const dynamicParams = false;

export default async function StoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { personId } = await params;
  if (!isStorySubject(personId)) notFound();
  const archive = loadArchive();
  const person = archive.peopleById.get(personId);
  if (!person) notFound();

  const chapters = deriveChapters(archive, person);
  const totalSources = chapters.reduce(
    (sum, ch) => sum + ch.sourceGroups.reduce((s, g) => s + g.sourceIds.length, 0),
    0
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-stone-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
        <span className="mx-2">/</span>
        <Link href="/story" className="hover:underline">
          Story
        </Link>
      </nav>

      <header className="mb-10">
        <div className="flex items-center gap-4">
          <PersonAvatar person={person} archive={archive} size={72} />
          <h1 className="text-2xl font-semibold text-stone-900">
            {person.display_name.split('(')[0].trim()}
          </h1>
        </div>
        <p className="mt-2 text-sm text-stone-600">
          <LifespanLine person={person} archive={archive} />
        </p>
        <p className="mt-2 text-sm text-stone-600">
          {totalSources} sources across {chapters.length} chapters ·{' '}
          <Link href={`/people/${person.id}`} className="hover:underline">
            person record
          </Link>
        </p>
        <p className="mt-2">
          <SubjectConfidenceNote person={person} />
        </p>
        {/* Chapter TOC — server-rendered anchor jump nav */}
        <p className="mt-4 text-sm text-stone-600">
          {chapters.map((ch, i) => (
            <span key={ch.id}>
              {i > 0 && <span className="mx-1.5 text-stone-300">·</span>}
              <a href={`#chapter-${ch.id}`} className="hover:underline">
                {ch.title}
              </a>
            </span>
          ))}
        </p>
      </header>

      <div className="space-y-12">
        {chapters.map(ch => (
          <Chapter key={ch.id} chapter={ch} person={person} archive={archive} />
        ))}
      </div>

      <footer className="mt-12 border-t border-stone-200 pt-6 text-xs text-stone-500">
        <p>
          Chapters are derived from citation-backed residences and source dates — nothing here
          is asserted without a source link. Historical context strips (&ldquo;Meanwhile&rdquo;)
          are unattributed era anchors, not sourced claims.
        </p>
      </footer>
    </main>
  );
}

function LifespanLine({ person, archive }: { person: PersonRecord; archive: Archive }) {
  const placeName = (id: string | null) =>
    id ? archive.placesById.get(id)?.display ?? id.replace(/^place_/, '').replace(/_/g, ' ') : null;
  const birth = person.birth.date
    ? `b. ${person.birth.date}${person.birth.place ? `, ${placeName(person.birth.place)}` : ''}`
    : null;
  const death = person.death.date
    ? `d. ${person.death.date}${person.death.place ? `, ${placeName(person.death.place)}` : ''}`
    : null;
  if (!birth && !death) return <>Lifespan undocumented.</>;
  return <>{[birth, death].filter(Boolean).join(' — ')}</>;
}

// Patrick's parentage is explicitly unresolved (Hyp A / Hyp B); the
// storyboard must not flatten that into settled identity.
function SubjectConfidenceNote({ person }: { person: PersonRecord }) {
  const c = person.family_confidence;
  if (c >= 75) {
    return (
      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
        family confidence: {c}
      </span>
    );
  }
  return (
    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
      family confidence: {c} — identity within the family line is not settled; see the person
      record for the open hypotheses
    </span>
  );
}

function Chapter({
  chapter,
  person,
  archive,
}: {
  chapter: StoryChapter;
  person: PersonRecord;
  archive: Archive;
}) {
  const narrative = loadAiChapterNarrative(person.id, chapter.id);
  const visible = chapter.sourceGroups.slice(0, VISIBLE_GROUPS);
  const folded = chapter.sourceGroups.slice(VISIBLE_GROUPS);
  const foldedCount = folded.reduce((s, g) => s + g.sourceIds.length, 0);

  return (
    <section id={`chapter-${chapter.id}`} className="relative border-l-2 border-stone-300 pl-6">
      <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-stone-400" aria-hidden />

      <header className="mb-4">
        <h2 className="text-lg font-semibold text-stone-900">{chapter.title}</h2>
        <p className="mt-1 text-sm text-stone-600">
          <WindowLine chapter={chapter} />
        </p>
        {chapter.residenceSourceIds.length > 0 && (
          <p className="mt-1 text-xs text-stone-500">
            residence established by:{' '}
            {chapter.residenceSourceIds.map((sid, i) => (
              <span key={sid}>
                {i > 0 && ', '}
                <CitationChip sourceId={sid} archive={archive} />
              </span>
            ))}
          </p>
        )}
      </header>

      {chapter.addressStanzas.length > 0 && (
        <dl className="mb-4 space-y-1 text-sm text-stone-700">
          {chapter.addressStanzas.filter(s => s.address).map((s, i) => (
            <div key={i} className="flex gap-2">
              <dt className="font-medium">{s.address}</dt>
              <dd className="text-stone-500">
                {stanzaRange(s.from, s.to)} · confidence {s.confidence}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {chapter.context.length > 0 && (
        <div className="mb-4 border-l-2 border-dashed border-stone-300 pl-3 text-sm italic text-stone-500">
          Meanwhile — {chapter.context.map(c => c.label).join(' · ')}
        </div>
      )}

      {narrative && (
        <div className="mb-4">
          <p className="leading-relaxed text-stone-700">
            {narrative.sentences.length > 0
              ? narrative.sentences.map((s, i) => (
                  <span key={i}>
                    {s.text}{' '}
                    {s.source_ids.map(sid => (
                      <sup key={sid}>
                        <Link href={`/sources/${sid}`} className="text-stone-400 hover:underline">
                          †
                        </Link>
                      </sup>
                    ))}{' '}
                  </span>
                ))
              : narrative.narrative}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            AI-generated ({narrative.model}). Every sentence cites its sources.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {visible.map(group => (
          <SourceGroupCard key={group.clusterId} group={group} archive={archive} />
        ))}
        {folded.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-stone-500 hover:text-stone-800">
              Show all {foldedCount} remaining sources from this period
            </summary>
            <div className="mt-4 space-y-4">
              {folded.map(group => (
                <SourceGroupCard key={group.clusterId} group={group} archive={archive} />
              ))}
            </div>
          </details>
        )}
        {chapter.sourceGroups.length === 0 && (
          <p className="text-sm text-stone-500">
            No sources dated to this period yet
            {chapter.residenceSourceIds.length > 0 &&
              ' — the residence itself is documented (citations above)'}
            .
          </p>
        )}
      </div>

      {chapter.coOccurrences.length > 0 && (
        <div className="mt-4 text-sm text-stone-700">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
            During this period, appears alongside
          </h3>
          <ul className="space-y-1">
            {chapter.coOccurrences.slice(0, 8).map(co => {
              const other = archive.peopleById.get(co.personId);
              return (
                <li key={co.personId}>
                  <Link href={`/people/${co.personId}`} className="font-medium hover:underline">
                    {(other?.display_name ?? co.personId).split('(')[0].trim()}
                  </Link>
                  {co.relation && (
                    <span className="text-stone-500"> ({co.relation.replace(/_/g, ' ')})</span>
                  )}{' '}
                  in {co.sourceIds.length} source{co.sourceIds.length === 1 ? '' : 's'}:{' '}
                  {co.sourceIds.map((sid, i) => (
                    <span key={sid} className="text-xs">
                      {i > 0 && ', '}
                      <Link href={`/sources/${sid}`} className="text-stone-500 hover:underline">
                        [{i + 1}]
                      </Link>
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// One moment: a crossref cluster of sources (often a single source;
// sometimes the same incident reported by two papers).
function SourceGroupCard({
  group,
  archive,
}: {
  group: { clusterId: string; sourceIds: string[] };
  archive: Archive;
}) {
  const primary = archive.sourcesById.get(group.sourceIds[0]);
  if (!primary) return null;
  const siblings = group.sourceIds.slice(1);
  const ai = primary.type === 'clipping' ? loadAiClippingSummary(primary.id) : null;
  const prose = ai?.summary ?? primary.summary;
  const quotes = (ai?.key_quotes ?? []).slice(0, 2);
  const { title, citation } = sourceListing(primary);

  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-300">
      <header className="mb-1">
        <Link href={`/sources/${primary.id}`} className="text-sm hover:underline">
          <span className="font-medium">{citation}</span>
        </Link>
      </header>
      {title && <h3 className="mb-1 text-base font-medium text-stone-900">{title}</h3>}
      {prose && <p className="text-sm leading-6 text-stone-700">{prose}</p>}
      {quotes.map((q, i) => (
        <blockquote
          key={i}
          className="mt-2 border-l-2 border-stone-300 pl-3 font-serif text-sm italic leading-6 text-stone-700"
        >
          &ldquo;{q}&rdquo;
        </blockquote>
      ))}
      {ai && (
        <p className="mt-1 text-xs text-stone-400">
          Summary AI-generated ({ai.model}); verify against the transcription.
        </p>
      )}
      {siblings.length > 0 && (
        <p className="mt-2 text-xs text-stone-500">
          Same moment, also reported in:{' '}
          {siblings.map((sid, i) => (
            <span key={sid}>
              {i > 0 && '; '}
              <CitationChip sourceId={sid} archive={archive} />
            </span>
          ))}
        </p>
      )}
    </article>
  );
}

// A source-ID citation that degrades honestly: linked when the source
// is loaded, a "pending" chip when the ID isn't resolvable yet (e.g.
// PREDICTED document records not yet filed).
function CitationChip({ sourceId, archive }: { sourceId: string; archive: Archive }) {
  const src: Source | undefined = archive.sourcesById.get(sourceId);
  if (!src) {
    return (
      <code
        className="rounded bg-stone-100 px-1 py-0.5 text-[11px] text-stone-500"
        title="document record pending"
      >
        {sourceId}
      </code>
    );
  }
  return (
    <Link href={`/sources/${sourceId}`} className="hover:underline">
      {sourceListing(src).citation}
    </Link>
  );
}

function WindowLine({ chapter }: { chapter: StoryChapter }) {
  const { from, to, fromClamped, toClamped } = chapter.window;
  if (!from && !to) return <>dates unknown</>;
  const fromLabel = from ? (fromClamped ? `by ${from}` : from) : 'unknown';
  const toLabel = to ? (toClamped ? `until at least ${to}` : to) : 'onward';
  if (chapter.kind === 'posthumous') return <>after {from}</>;
  return (
    <>
      {fromLabel} → {toLabel}
    </>
  );
}

function stanzaRange(from: string | null, to: string | null): string {
  if (!from && !to) return 'dates unknown';
  return `${from ?? '…'} → ${to ?? '…'}`;
}
