// Generic source detail page. Dispatches on source.type — adding a new
// source subtype (CensusRecord, GedcomImport, etc.) means adding a
// renderer here and nothing else.
//
// This is the LEAF page every other page links to for source
// attribution. Build it solid: the source-attribution rule says every
// claim in the UI must terminate here in full citation form.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadAiClippingSummary, loadArchive } from '@/lib/data';
import type { AiClippingSummary, Archive, Clipping, Source } from '@/lib/data';

type Params = { id: string };

export function generateStaticParams(): Params[] {
  const archive = loadArchive();
  return archive.sources.map(s => ({ id: s.id }));
}

export default async function SourcePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const archive = loadArchive();
  const source = archive.sourcesById.get(id);
  if (!source) notFound();

  // Currently only Clipping exists. When the Source union grows
  // (CensusRecord, GedcomImport, …) convert this to a switch and add
  // a renderer per type. TypeScript will then enforce exhaustiveness
  // on `source.type`.
  if (source.type === 'clipping') {
    const aiSummary = loadAiClippingSummary(source.id);
    return <ClippingDetail source={source} archive={archive} aiSummary={aiSummary} />;
  }
  return null;
}

// ---- Clipping renderer ----------------------------------------------------

function ClippingDetail({
  source,
  archive,
  aiSummary,
}: {
  source: Clipping;
  archive: Archive;
  aiSummary: AiClippingSummary | null;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>

      <Header source={source} />

      {source.summary && (
        <Section title="Summary">
          <p className="whitespace-pre-line text-zinc-700">{source.summary}</p>
        </Section>
      )}

      {aiSummary && (
        <Section title="Narrative">
          <p className="text-zinc-700 leading-relaxed">{aiSummary.summary}</p>
          {aiSummary.key_quotes.length > 0 && (
            <ul className="mt-4 space-y-2">
              {aiSummary.key_quotes.map((q, i) => (
                <li
                  key={i}
                  className="border-l-2 border-zinc-300 pl-3 font-serif italic leading-7 text-zinc-700"
                >
                  &ldquo;{q}&rdquo;
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-zinc-400">
            AI-generated ({aiSummary.model}). Verify against the transcription before quoting.
          </p>
        </Section>
      )}

      {source.people.length > 0 && (
        <Section title="People">
          <ul className="space-y-3">
            {source.people.map((link, i) => {
              const person = archive.peopleById.get(link.id);
              return (
                <li key={`${link.id}-${i}`} className="border-l-2 border-zinc-200 pl-3">
                  <div>
                    <Link href={`/people/${link.id}`} className="font-medium hover:underline">
                      {person?.display_name ?? link.id}
                    </Link>
                    {link.name_as_printed && person?.display_name !== link.name_as_printed && (
                      <span className="ml-1 text-sm text-zinc-500">
                        (as printed: {link.name_as_printed})
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-zinc-600">
                    {link.role_in_story && <span>role: {link.role_in_story} · </span>}
                    <ConfidenceBadge value={link.confidence_is_my_family} />
                  </div>
                  {link.confidence_notes && (
                    <p className="mt-1 text-sm text-zinc-500 whitespace-pre-line">
                      {link.confidence_notes}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {source.mentioned.length > 0 && (
        <Section title="Also mentioned">
          <ul className="space-y-2 text-sm">
            {source.mentioned.map((m, i) => (
              <li key={`${m.name_as_printed}-${i}`} className="text-zinc-700">
                <span className="font-medium">{m.name_as_printed}</span>
                {m.role_in_story && (
                  <span className="text-zinc-500"> · {m.role_in_story}</span>
                )}
                {m.note && (
                  <p className="mt-0.5 text-zinc-500 whitespace-pre-line">{m.note}</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {source.places.length > 0 && (
        <Section title="Places">
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {source.places.map((link, i) => {
              const place = archive.placesById.get(link.id);
              return (
                <li key={`${link.id}-${i}`}>
                  <Link href={`/places/${link.id}`} className="hover:underline">
                    {place?.display ?? link.id}
                  </Link>
                  {link.role && <span className="text-zinc-500"> ({link.role})</span>}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {source.themes.length > 0 && (
        <Section title="Themes">
          <ul className="flex flex-wrap gap-2 text-sm">
            {source.themes.map(theme => (
              <li key={theme}>
                <Link
                  href={`/themes/${theme}`}
                  className="rounded bg-zinc-100 px-2 py-0.5 hover:bg-zinc-200"
                >
                  {theme}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {source.story_threads.length > 0 && (
        <Section title="Story threads">
          <ul className="space-y-1 text-sm">
            {source.story_threads.map(tid => {
              const thread = archive.threadsById.get(tid);
              return (
                <li key={tid}>
                  <Link href={`/threads/${tid}`} className="hover:underline">
                    {thread?.display ?? tid}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {source.tags.length > 0 && (
        <Section title="Tags">
          <ul className="flex flex-wrap gap-2 text-sm">
            {source.tags.map(tag => (
              <li key={tag} className="rounded border border-zinc-200 px-2 py-0.5 text-zinc-600">
                {tag}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {source.source_type.length > 0 && (
        <Section title="Source type">
          <p className="text-sm text-zinc-600">{source.source_type.join(', ')}</p>
        </Section>
      )}

      {source.crossrefs.length > 0 && (
        <Section title="Related sources">
          <ul className="space-y-1 text-sm">
            {source.crossrefs.map(refId => {
              const other = archive.sourcesById.get(refId);
              return (
                <li key={refId}>
                  <Link href={`/sources/${refId}`} className="hover:underline">
                    {other && other.type === 'clipping'
                      ? `${other.date} — ${other.newspaper}${other.headline ? ` — ${other.headline}` : ''}`
                      : refId}
                  </Link>
                  {!other && (
                    <span className="ml-1 text-xs text-amber-700">(unresolved)</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {source.transcription && (
        <Section title="Transcription">
          <div className="rounded border border-zinc-200 bg-zinc-50 p-4 text-sm">
            <TranscriptionStatusBadge
              status={source.transcription_status}
              confidence={source.transcription_confidence}
            />
            <div className="mt-3 whitespace-pre-line font-serif leading-7 text-zinc-800">
              {source.transcription}
            </div>
          </div>
        </Section>
      )}

      {source.open_questions.length > 0 && (
        <Section title="Open questions">
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
            {source.open_questions.map((q, i) => (
              <li key={i} className="whitespace-pre-line">{q}</li>
            ))}
          </ul>
        </Section>
      )}

      <footer className="mt-12 border-t border-zinc-200 pt-6 text-xs text-zinc-500">
        <p>
          Source ID: <code className="rounded bg-zinc-100 px-1 py-0.5">{source.id}</code>
        </p>
        {source.page_id && (
          <p className="mt-1">
            On page:{' '}
            <Link href={`/pages/${source.page_id}`} className="hover:underline">
              {source.page_id}
            </Link>
          </p>
        )}
        {source.clipped_by && source.clipped_date && (
          <p className="mt-1">
            Clipped by {source.clipped_by} on {source.clipped_date}.
          </p>
        )}
      </footer>
    </main>
  );
}

function Header({ source }: { source: Clipping }) {
  const citation = [
    source.newspaper,
    source.city,
    source.date,
    `p.${source.page}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <header className="mb-8">
      {source.headline ? (
        <h1 className="text-2xl font-semibold text-zinc-900">{source.headline}</h1>
      ) : (
        <h1 className="text-2xl font-semibold text-zinc-900">
          {source.newspaper}, {source.date}, p.{source.page}
        </h1>
      )}
      <p className="mt-2 text-sm text-zinc-600">{citation}</p>
      {source.dateline && (
        <p className="mt-1 text-sm italic text-zinc-500">Dateline: {source.dateline}</p>
      )}
      {source.image_url && (
        <p className="mt-3 text-sm">
          <a
            href={source.image_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-700 underline hover:text-zinc-900"
          >
            View on Newspapers.com ↗
          </a>
        </p>
      )}
    </header>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  // Band the value per the confidence scale in CLAUDE.md.
  let label = '';
  let color = '';
  if (value >= 95) {
    label = `${value} certain`;
    color = 'bg-emerald-100 text-emerald-900';
  } else if (value >= 75) {
    label = `${value} strong`;
    color = 'bg-emerald-50 text-emerald-800';
  } else if (value >= 25) {
    label = `${value} candidate`;
    color = 'bg-amber-100 text-amber-900';
  } else if (value >= 10) {
    label = `${value} flag`;
    color = 'bg-zinc-100 text-zinc-700';
  } else {
    label = '0 not family';
    color = 'bg-zinc-100 text-zinc-500';
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${color}`}>
      family confidence: {label}
    </span>
  );
}

function TranscriptionStatusBadge({
  status,
  confidence,
}: {
  status: Source['transcription_status'];
  confidence: Source['transcription_confidence'];
}) {
  if (status === 'none') {
    return <span className="text-xs text-zinc-500">No transcription.</span>;
  }
  const color =
    status === 'complete' && confidence === 'high'
      ? 'text-emerald-700'
      : status === 'partial' || confidence === 'medium'
      ? 'text-amber-700'
      : 'text-zinc-600';
  return (
    <span className={`text-xs uppercase tracking-wide ${color}`}>
      transcription: {status}
      {confidence && ` · confidence ${confidence}`}
    </span>
  );
}
