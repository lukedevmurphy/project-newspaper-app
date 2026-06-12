// Page detail. The "wide angle" view of a single newspaper page —
// shows the AI vision summary, the headlines visible on the page, the
// clippings that have been pulled out of it (with prominence + column
// placement), and observed juxtapositions. Linked from the source-detail
// page's "On page:" footer.

import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadAiPageSummary, loadArchive, photoUrl } from '@/lib/data';
import type {
  AiPageSummary,
  Archive,
  ClippingPlacement,
  ClippingProminence,
  Clipping,
  PageRecord,
} from '@/lib/data';

type Params = { id: string };

export function generateStaticParams(): Params[] {
  const archive = loadArchive();
  return archive.pages.map(p => ({ id: p.id }));
}

export default async function PageDetail({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const archive = loadArchive();
  const page = archive.pagesById.get(id);
  if (!page) notFound();

  const aiSummary = loadAiPageSummary(page.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>

      <Header page={page} />

      {aiSummary && (
        <Section title="Page overview">
          <p className="text-zinc-700 leading-relaxed">{aiSummary.summary}</p>
          <p className="mt-3 text-xs text-zinc-400">
            AI-generated ({aiSummary.model}). Verify against the page image before quoting.
          </p>
        </Section>
      )}

      {aiSummary && aiSummary.headlines.length > 0 && (
        <Section title="Headlines on this page">
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm text-zinc-700">
            {aiSummary.headlines.map((h, i) => (
              <li
                key={i}
                className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5"
              >
                {h}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {page.clippings.length > 0 && (
        <Section title="Clippings pulled from this page">
          <ul className="space-y-3">
            {page.clippings.map(cid => {
              const clipping = archive.sourcesById.get(cid);
              const placement = aiSummary?.clipping_placements.find(p => p.clipping_id === cid);
              return (
                <li key={cid} className="border-l-2 border-zinc-200 pl-3">
                  <Link
                    href={`/sources/${cid}`}
                    className="font-medium hover:underline"
                  >
                    {clipping && clipping.type === 'clipping' && clipping.headline
                      ? clipping.headline
                      : cid}
                  </Link>
                  {clipping && clipping.type === 'clipping' && (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {clipping.date}{clipping.dateline ? ` · ${clipping.dateline}` : ''}
                    </p>
                  )}
                  {placement && (
                    <p className="mt-1 text-sm text-zinc-600">
                      <ProminenceBadge value={placement.prominence} />
                      <span className="ml-2">{placement.column}</span>
                      {placement.placement_note && (
                        <span className="text-zinc-500"> · {placement.placement_note}</span>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {aiSummary && aiSummary.juxtapositions.length > 0 && (
        <Section title="Juxtapositions">
          <ul className="space-y-2">
            {aiSummary.juxtapositions.map((j, i) => (
              <li
                key={i}
                className="border-l-2 border-zinc-300 pl-3 font-serif italic leading-7 text-zinc-700"
              >
                {j}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <PagePhotos page={page} archive={archive} />

      {page.full_transcription && (
        <Section title="Full page transcription">
          <details className="rounded border border-zinc-200 bg-zinc-50 p-4 text-sm">
            <summary className="cursor-pointer text-zinc-700 hover:text-zinc-900">
              {page.full_transcription_status === 'human_corrected'
                ? 'Read the full transcription (human-corrected)'
                : 'Read the full transcription'}
              {page.full_transcription_status === 'ai_truncated' && (
                <span className="ml-2 text-xs text-amber-700">incomplete — truncated</span>
              )}
            </summary>
            {page.full_transcription_status !== 'human_corrected' && (
              <p className="mt-3 text-xs text-zinc-400">
                AI-generated{page.full_transcription_model ? ` (${page.full_transcription_model})` : ''}.
                Verify against the page image before quoting.
              </p>
            )}
            <div className="mt-3 whitespace-pre-line font-serif leading-7 text-zinc-800">
              {page.full_transcription}
            </div>
          </details>
        </Section>
      )}

      {page.peripheral_items.length > 0 && (
        <Section title="Peripheral items I've noted">
          <ul className="space-y-3 text-sm">
            {page.peripheral_items.map((item, i) => (
              <li key={i} className="border-l-2 border-zinc-200 pl-3">
                <p className="font-medium text-zinc-800">{item.title}</p>
                {item.summary && (
                  <p className="mt-1 whitespace-pre-line text-zinc-600">{item.summary}</p>
                )}
                {item.tags && item.tags.length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {item.tags.map(t => (
                      <li key={t} className="rounded border border-zinc-200 px-1.5 py-0.5 text-zinc-500">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <footer className="mt-12 border-t border-zinc-200 pt-6 text-xs text-zinc-500">
        <p>
          Page ID: <code className="rounded bg-zinc-100 px-1 py-0.5">{page.id}</code>
        </p>
      </footer>
    </main>
  );
}

function Header({ page }: { page: PageRecord }) {
  const citation = [page.newspaper, page.city, page.date, `p.${page.page}`]
    .filter(Boolean)
    .join(', ');
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold text-zinc-900">
        {page.newspaper}, {page.date}, p.{page.page}
      </h1>
      <p className="mt-2 text-sm text-zinc-600">{citation}</p>
      {page.url && (
        <p className="mt-3 text-sm">
          <a
            href={page.url}
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

// Registered photo crops from this page (archive/photos/photos.yaml),
// served from the external image bucket. Candidate-status badges show
// whether the user has confirmed each identification.
function PagePhotos({ page, archive }: { page: PageRecord; archive: Archive }) {
  const photos = archive.photosByPageId.get(page.id) ?? [];
  if (photos.length === 0) return null;
  return (
    <Section title="Photographs on this page">
      <ul className="flex flex-wrap gap-6">
        {photos.map(photo => {
          const url = photoUrl(photo);
          return (
            <li key={photo.id} className="w-44">
              {url ? (
                <Image
                  src={url}
                  alt={photo.caption_as_printed ?? photo.id}
                  width={352}
                  height={440}
                  className="rounded border border-zinc-200"
                />
              ) : (
                <div className="rounded border border-dashed border-zinc-300 p-3 text-xs text-zinc-500">
                  registered crop (image bucket not configured)
                </div>
              )}
              <p className="mt-1 text-xs text-zinc-600">
                {photo.caption_as_printed && (
                  <span className="italic">&ldquo;{photo.caption_as_printed.slice(0, 120)}{photo.caption_as_printed.length > 120 ? '…' : ''}&rdquo;</span>
                )}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {photo.person_candidates.map(c => {
                  const person = archive.peopleById.get(c.person_id);
                  return (
                    <li key={c.person_id}>
                      <Link href={`/people/${c.person_id}`} className="hover:underline">
                        {(person?.display_name ?? c.person_id).split('(')[0].trim()}
                      </Link>{' '}
                      <span
                        className={
                          c.status === 'confirmed'
                            ? 'rounded bg-amber-100 px-1 py-0.5 text-amber-900'
                            : c.status === 'rejected'
                            ? 'rounded bg-zinc-100 px-1 py-0.5 text-zinc-400 line-through'
                            : 'rounded bg-zinc-100 px-1 py-0.5 text-zinc-600'
                        }
                      >
                        {c.status} {c.confidence}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function ProminenceBadge({ value }: { value: ClippingProminence }) {
  const styles: Record<ClippingProminence, string> = {
    lead: 'bg-amber-100 text-amber-900',
    secondary: 'bg-zinc-100 text-zinc-700',
    buried: 'bg-zinc-50 text-zinc-500',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${styles[value]}`}>{value}</span>
  );
}
