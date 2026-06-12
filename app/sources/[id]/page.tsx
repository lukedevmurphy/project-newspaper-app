// Generic source detail page. Dispatches on source.type — adding a new
// source subtype means adding a renderer here and nothing else.
//
// This is the LEAF page every other page links to for source
// attribution. Build it solid: the source-attribution rule says every
// claim in the UI must terminate here in full citation form.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { documentGroup, humanizeDocumentType, loadAiClippingSummary, loadArchive, sourceListing } from '@/lib/data';
import type {
  AiClippingSummary,
  Archive,
  Clipping,
  DocumentPersonLink,
  DocumentSource,
  PersonLink,
  Source,
} from '@/lib/data';

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

  switch (source.type) {
    case 'clipping': {
      const aiSummary = loadAiClippingSummary(source.id);
      return <ClippingDetail source={source} archive={archive} aiSummary={aiSummary} />;
    }
    case 'document':
      return <DocumentDetail source={source} archive={archive} />;
  }
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
      <nav className="mb-6 text-sm text-stone-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>

      <ClippingHeader source={source} />

      <SummarySection source={source} />

      {aiSummary && (
        <Section title="Narrative">
          <p className="text-stone-700 leading-relaxed">{aiSummary.summary}</p>
          {aiSummary.key_quotes.length > 0 && (
            <ul className="mt-4 space-y-2">
              {aiSummary.key_quotes.map((q, i) => (
                <li
                  key={i}
                  className="border-l-2 border-stone-300 pl-3 font-serif italic leading-7 text-stone-700"
                >
                  &ldquo;{q}&rdquo;
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-stone-400">
            AI-generated ({aiSummary.model}). Verify against the transcription before quoting.
          </p>
        </Section>
      )}

      <PeopleSection source={source} archive={archive} />
      <MentionedSection source={source} />
      <PlacesSection source={source} archive={archive} />
      <ThemesSection source={source} />
      <ThreadsSection source={source} archive={archive} />
      <TagsSection source={source} />

      {source.source_type.length > 0 && (
        <Section title="Source type">
          <p className="text-sm text-stone-600">{source.source_type.join(', ')}</p>
        </Section>
      )}

      <CrossrefsSection source={source} archive={archive} />
      <TranscriptionSection source={source} />
      <OpenQuestionsSection source={source} />

      <footer className="mt-12 border-t border-stone-200 pt-6 text-xs text-stone-500">
        <p>
          Source ID: <code className="rounded bg-stone-100 px-1 py-0.5">{source.id}</code>
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

function ClippingHeader({ source }: { source: Clipping }) {
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
        <h1 className="text-2xl font-semibold text-stone-900">{source.headline}</h1>
      ) : (
        <h1 className="text-2xl font-semibold text-stone-900">
          {source.newspaper}, {source.date}, p.{source.page}
        </h1>
      )}
      <p className="mt-2 text-sm text-stone-600">{citation}</p>
      {source.dateline && (
        <p className="mt-1 text-sm italic text-stone-500">Dateline: {source.dateline}</p>
      )}
      {source.image_url && (
        <p className="mt-3 text-sm">
          <a
            href={source.image_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-700 underline hover:text-stone-900"
          >
            View on Newspapers.com ↗
          </a>
        </p>
      )}
    </header>
  );
}

// ---- Document renderer ------------------------------------------------------

function DocumentDetail({
  source,
  archive,
}: {
  source: DocumentSource;
  archive: Archive;
}) {
  const group = documentGroup(source.document_type);
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-stone-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>

      <DocumentHeader source={source} />

      <SummarySection source={source} />

      {group === 'census' && <CensusHouseholdTable source={source} archive={archive} />}
      {group === 'directory' && <DirectoryEntries source={source} archive={archive} />}
      {group === 'vital_record' && <VitalRecordParties source={source} archive={archive} />}

      <PeopleSection source={source} archive={archive} title={group === 'generic' ? 'People' : 'People — link detail'} />
      <MentionedSection source={source} />
      <PlacesSection source={source} archive={archive} />
      <ThemesSection source={source} />
      <ThreadsSection source={source} archive={archive} />
      <TagsSection source={source} />
      <CrossrefsSection source={source} archive={archive} />
      <TranscriptionSection source={source} />
      <OpenQuestionsSection source={source} />

      <footer className="mt-12 border-t border-stone-200 pt-6 text-xs text-stone-500">
        <p>
          Source ID: <code className="rounded bg-stone-100 px-1 py-0.5">{source.id}</code>
        </p>
        {source.reference && <p className="mt-1">Reference: {source.reference}</p>}
        {source.accessed_by && source.accessed_date && (
          <p className="mt-1">
            Accessed by {source.accessed_by} on {source.accessed_date}.
          </p>
        )}
      </footer>
    </main>
  );
}

function DocumentHeader({ source }: { source: DocumentSource }) {
  const citation = [
    source.collection,
    source.jurisdiction,
    source.date_raw ?? source.date,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold text-stone-900">
        {source.headline || `${humanizeDocumentType(source.document_type)}, ${source.date_raw ?? source.date ?? 'undated'}`}
      </h1>
      <p className="mt-2 text-sm text-stone-600">{citation}</p>
      {source.date_confidence !== 'certain' && (
        <p className="mt-1 text-xs text-amber-700">date confidence: {source.date_confidence}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-stone-100 px-2 py-0.5 text-stone-700">
          {humanizeDocumentType(source.document_type)}
        </span>
        <span
          className={
            source.focus === 'primary'
              ? 'rounded bg-emerald-50 px-2 py-0.5 text-emerald-800'
              : 'rounded bg-stone-100 px-2 py-0.5 text-stone-500'
          }
        >
          {source.focus} focus
        </span>
      </div>
      {source.accessed_url && (
        <p className="mt-3 text-sm">
          <a
            href={source.accessed_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-700 underline hover:text-stone-900"
          >
            View original record ↗
          </a>
        </p>
      )}
    </header>
  );
}

// Census household composition, straight from the people[] as-printed
// fields. Only columns with at least one value render.
function CensusHouseholdTable({ source, archive }: { source: DocumentSource; archive: Archive }) {
  if (source.people.length === 0) return null;
  const columns: { key: keyof DocumentPersonLink; label: string }[] = [
    { key: 'role_in_source', label: 'Role' },
    { key: 'age_as_printed', label: 'Age' },
    { key: 'sex_as_printed', label: 'Sex' },
    { key: 'birth_year_as_printed', label: 'Born' },
    { key: 'birth_place_as_printed', label: 'Birthplace' },
    { key: 'occupation_as_printed', label: 'Occupation' },
    { key: 'marital_status_as_printed', label: 'Marital status' },
    { key: 'naturalization_status_as_printed', label: 'Naturalization' },
    { key: 'years_in_us', label: 'Years in US' },
  ];
  const active = columns.filter(c => source.people.some(p => p[c.key]));

  return (
    <Section title="Household as enumerated">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="py-1.5 pr-3 font-semibold">Name as printed</th>
              {active.map(c => (
                <th key={c.key} className="py-1.5 pr-3 font-semibold">{c.label}</th>
              ))}
              <th className="py-1.5 font-semibold">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {source.people.map((p, i) => {
              const person = archive.peopleById.get(p.id);
              return (
                <tr key={`${p.id}-${i}`} className="border-b border-stone-100 align-top">
                  <td className="py-1.5 pr-3">
                    <Link href={`/people/${p.id}`} className="font-medium hover:underline">
                      {p.name_as_printed ?? person?.display_name ?? p.id}
                    </Link>
                  </td>
                  {active.map(c => (
                    <td key={c.key} className="py-1.5 pr-3 text-stone-700">
                      {c.key === 'role_in_source'
                        ? (p.role_in_source ?? '').replace(/_/g, ' ')
                        : p[c.key] ?? ''}
                    </td>
                  ))}
                  <td className="py-1.5">
                    <ConfidenceDot value={p.confidence_is_my_family} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// City-directory lines, rendered the way a directory column reads.
function DirectoryEntries({ source, archive }: { source: DocumentSource; archive: Archive }) {
  if (source.people.length === 0) return null;
  return (
    <Section title="Directory entries">
      <ul className="space-y-3">
        {source.people.map((p, i) => {
          const person = archive.peopleById.get(p.id);
          return (
            <li key={`${p.id}-${i}`} className="border-l-2 border-stone-200 pl-3">
              <div className="font-serif text-stone-800">
                <Link href={`/people/${p.id}`} className="font-semibold hover:underline">
                  {p.name_as_printed ?? person?.display_name ?? p.id}
                </Link>
                {p.occupation_as_printed && <span> — {p.occupation_as_printed}</span>}
                {p.residence_as_printed && <span>, r {p.residence_as_printed}</span>}
              </div>
              <div className="mt-0.5 text-xs text-stone-500">
                {person && person.display_name !== p.name_as_printed && (
                  <span>= {person.display_name} · </span>
                )}
                <ConfidenceDot value={p.confidence_is_my_family} />
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// Civil / parish record parties, grouped by their role in the record.
function VitalRecordParties({ source, archive }: { source: DocumentSource; archive: Archive }) {
  if (source.people.length === 0) return null;
  const detailFields: { key: keyof DocumentPersonLink; label: string }[] = [
    { key: 'age_as_printed', label: 'age' },
    { key: 'marital_status_as_printed', label: 'status' },
    { key: 'occupation_as_printed', label: 'occupation' },
    { key: 'residence_as_printed', label: 'residence' },
    { key: 'birth_date_as_printed', label: 'born' },
    { key: 'death_place_as_printed', label: 'died at' },
  ];
  return (
    <Section title="Parties named in the record">
      <ul className="space-y-3">
        {source.people.map((p, i) => {
          const person = archive.peopleById.get(p.id);
          const details = detailFields
            .filter(f => p[f.key])
            .map(f => `${f.label}: ${p[f.key]}`)
            .join(' · ');
          return (
            <li key={`${p.id}-${i}`} className="border-l-2 border-stone-200 pl-3">
              <div className="text-xs uppercase tracking-wide text-stone-500">
                {(p.role_in_source ?? 'named').replace(/_/g, ' ')}
              </div>
              <div>
                <Link href={`/people/${p.id}`} className="font-medium hover:underline">
                  {p.name_as_printed ?? person?.display_name ?? p.id}
                </Link>
                {person && person.display_name !== p.name_as_printed && (
                  <span className="ml-1 text-sm text-stone-500">(= {person.display_name})</span>
                )}
                <span className="ml-2">
                  <ConfidenceDot value={p.confidence_is_my_family} />
                </span>
              </div>
              {details && <p className="text-sm text-stone-600">{details}</p>}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ---- Shared sections (read SourceBase fields only) --------------------------

function SummarySection({ source }: { source: Source }) {
  if (!source.summary) return null;
  return (
    <Section title="Summary">
      <p className="whitespace-pre-line text-stone-700">{source.summary}</p>
    </Section>
  );
}

function PeopleSection({
  source,
  archive,
  title = 'People',
}: {
  source: Source;
  archive: Archive;
  title?: string;
}) {
  if (source.people.length === 0) return null;
  return (
    <Section title={title}>
      <ul className="space-y-3">
        {source.people.map((link, i) => {
          const person = archive.peopleById.get(link.id);
          return (
            <li key={`${link.id}-${i}`} className="border-l-2 border-stone-200 pl-3">
              <div>
                <Link href={`/people/${link.id}`} className="font-medium hover:underline">
                  {person?.display_name ?? link.id}
                </Link>
                {link.name_as_printed && person?.display_name !== link.name_as_printed && (
                  <span className="ml-1 text-sm text-stone-500">
                    (as printed: {link.name_as_printed})
                  </span>
                )}
              </div>
              <div className="text-sm text-stone-600">
                {link.role_in_story && (
                  <span>role: {link.role_in_story.replace(/_/g, ' ')} · </span>
                )}
                <ConfidenceBadge value={link.confidence_is_my_family} />
              </div>
              <AsPrintedDetails link={link} />
              {link.confidence_notes && (
                <p className="mt-1 text-sm text-stone-500 whitespace-pre-line">
                  {link.confidence_notes}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// Compact as-printed facts for document person links; renders nothing
// for plain clipping links.
function AsPrintedDetails({ link }: { link: PersonLink | DocumentPersonLink }) {
  const fields: { key: keyof DocumentPersonLink; label: string }[] = [
    { key: 'age_as_printed', label: 'age' },
    { key: 'sex_as_printed', label: 'sex' },
    { key: 'birth_year_as_printed', label: 'born' },
    { key: 'birth_date_as_printed', label: 'born' },
    { key: 'birth_place_as_printed', label: 'birthplace' },
    { key: 'death_place_as_printed', label: 'died at' },
    { key: 'marital_status_as_printed', label: 'status' },
    { key: 'occupation_as_printed', label: 'occupation' },
    { key: 'residence_as_printed', label: 'residence' },
    { key: 'naturalization_status_as_printed', label: 'naturalization' },
    { key: 'years_in_us', label: 'years in US' },
    { key: 'destination_as_printed', label: 'destination' },
  ];
  const doc = link as DocumentPersonLink;
  const present = fields.filter(f => doc[f.key]);
  if (present.length === 0) return null;
  return (
    <p className="mt-0.5 text-xs text-stone-500">
      {present.map(f => `${f.label}: ${doc[f.key]}`).join(' · ')}
    </p>
  );
}

function MentionedSection({ source }: { source: Source }) {
  if (source.mentioned.length === 0) return null;
  return (
    <Section title="Also mentioned">
      <ul className="space-y-2 text-sm">
        {source.mentioned.map((m, i) => (
          <li key={`${m.name_as_printed}-${i}`} className="text-stone-700">
            <span className="font-medium">{m.name_as_printed}</span>
            {m.role_in_story && (
              <span className="text-stone-500"> · {m.role_in_story}</span>
            )}
            {m.note && (
              <p className="mt-0.5 text-stone-500 whitespace-pre-line">{m.note}</p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PlacesSection({ source, archive }: { source: Source; archive: Archive }) {
  if (source.places.length === 0) return null;
  return (
    <Section title="Places">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {source.places.map((link, i) => {
          const place = archive.placesById.get(link.id);
          return (
            <li key={`${link.id}-${i}`}>
              <Link href={`/places/${link.id}`} className="hover:underline">
                {place?.display ?? link.id}
              </Link>
              {link.role && <span className="text-stone-500"> ({link.role})</span>}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function ThemesSection({ source }: { source: Source }) {
  if (source.themes.length === 0) return null;
  return (
    <Section title="Themes">
      <ul className="flex flex-wrap gap-2 text-sm">
        {source.themes.map(theme => (
          <li key={theme}>
            <Link
              href={`/themes/${theme}`}
              className="rounded bg-stone-100 px-2 py-0.5 hover:bg-stone-200"
            >
              {theme}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ThreadsSection({ source, archive }: { source: Source; archive: Archive }) {
  if (source.story_threads.length === 0) return null;
  return (
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
  );
}

function TagsSection({ source }: { source: Source }) {
  if (source.tags.length === 0) return null;
  return (
    <Section title="Tags">
      <ul className="flex flex-wrap gap-2 text-sm">
        {source.tags.map(tag => (
          <li key={tag} className="rounded border border-stone-200 px-2 py-0.5 text-stone-600">
            {tag}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function CrossrefsSection({ source, archive }: { source: Source; archive: Archive }) {
  if (source.crossrefs.length === 0) return null;
  return (
    <Section title="Related sources">
      <ul className="space-y-1 text-sm">
        {source.crossrefs.map(refId => {
          const other = archive.sourcesById.get(refId);
          if (!other) {
            return (
              <li key={refId}>
                <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">{refId}</code>
                <span className="ml-1 text-xs text-amber-700">(unresolved)</span>
              </li>
            );
          }
          const { title, citation } = sourceListing(other);
          return (
            <li key={refId}>
              <Link href={`/sources/${refId}`} className="hover:underline">
                {citation}
                {title ? ` — ${title}` : ''}
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function TranscriptionSection({ source }: { source: Source }) {
  if (!source.transcription) return null;
  return (
    <Section title="Transcription">
      <div className="rounded border border-stone-200 bg-stone-50 p-4 text-sm">
        <TranscriptionStatusBadge
          status={source.transcription_status}
          confidence={source.transcription_confidence}
        />
        <div className="mt-3 whitespace-pre-line font-serif leading-7 text-stone-800">
          {source.transcription}
        </div>
      </div>
    </Section>
  );
}

function OpenQuestionsSection({ source }: { source: Source }) {
  if (source.open_questions.length === 0) return null;
  return (
    <Section title="Open questions">
      <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
        {source.open_questions.map((q, i) => (
          <li key={i} className="whitespace-pre-line">{q}</li>
        ))}
      </ul>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Band the value per the confidence scale in CLAUDE.md.
function confidenceBand(value: number): { label: string; color: string } {
  if (value >= 95) return { label: `${value} certain`, color: 'bg-emerald-100 text-emerald-900' };
  if (value >= 75) return { label: `${value} strong`, color: 'bg-emerald-50 text-emerald-800' };
  if (value >= 25) return { label: `${value} candidate`, color: 'bg-amber-100 text-amber-900' };
  if (value >= 10) return { label: `${value} flag`, color: 'bg-stone-100 text-stone-700' };
  return { label: '0 not family', color: 'bg-stone-100 text-stone-500' };
}

function ConfidenceBadge({ value }: { value: number }) {
  const { label, color } = confidenceBand(value);
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${color}`}>
      family confidence: {label}
    </span>
  );
}

// Compact variant for table rows and inline lists.
function ConfidenceDot({ value }: { value: number }) {
  const { color } = confidenceBand(value);
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${color}`} title={`family confidence: ${value}`}>
      {value}
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
    return <span className="text-xs text-stone-500">No transcription.</span>;
  }
  const color =
    status === 'complete' && confidence === 'high'
      ? 'text-emerald-700'
      : status === 'partial' || confidence === 'medium'
      ? 'text-amber-700'
      : 'text-stone-600';
  return (
    <span className={`text-xs uppercase tracking-wide ${color}`}>
      transcription: {status}
      {confidence && ` · confidence ${confidence}`}
    </span>
  );
}
