// Page detail. The "wide angle" view of a single newspaper page —
// shows the AI vision summary, the headlines visible on the page, the
// clippings that have been pulled out of it (with prominence + column
// placement), and observed juxtapositions. Linked from the source-detail
// page's "On page:" footer.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadAiPageSummary, loadArchive } from '@/lib/data';
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
