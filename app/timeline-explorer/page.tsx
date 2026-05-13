// /timeline-explorer — the two-band timeline view.
//
// Top band: book-subject lifelines with residence segments + source ticks.
// Middle band: derived events from primary sources.
// Bottom band (collapsible, off by default): hard-coded external
// historical context (Famine, Land War, WWI, etc.).
//
// All positioning is server-rendered as percentages along the
// computed date span. The toggle is a native HTML <details>
// element — no client JS.

import Link from 'next/link';
import { loadArchive } from '@/lib/data';
import type { Archive, DerivedEvent, PersonRecord } from '@/lib/data';
import { EXTERNAL_CONTEXT } from '@/lib/timeline/external-context';
import {
  computeBounds,
  dateToPercent,
  decadeTicks,
  rangeToPercent,
  type TimelineBounds,
} from '@/lib/timeline/positioning';

export default function TimelineExplorerPage() {
  const archive = loadArchive();

  // Bounds across all sources, residences, and external-context periods.
  const allDates: (string | null)[] = [];
  for (const s of archive.sources) allDates.push(s.date);
  for (const p of archive.people) {
    for (const r of p.residences ?? []) {
      allDates.push(r.date_range.from);
      allDates.push(r.date_range.to);
    }
  }
  for (const c of EXTERNAL_CONTEXT) {
    allDates.push(c.from);
    allDates.push(c.to);
  }
  const bounds = computeBounds(allDates, /*bufferYears=*/ 2);

  const bookSubjects = archive.people
    .filter(p => p.is_book_subject === true)
    .sort((a, b) => {
      const ea = earliestDate(a, archive);
      const eb = earliestDate(b, archive);
      return (ea ?? '9999').localeCompare(eb ?? '9999');
    });

  return (
    <main className="mx-auto max-w-[90rem] px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/" className="hover:underline">
          ← Archive
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Timeline Explorer</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Top band: {bookSubjects.length} book subjects, with known
          residences and source-tick marks. Middle band: {archive.events.length}{' '}
          events derived from primary sources. Each tick or dot links
          to its source. Span:{' '}
          <code className="text-xs">{bounds.startYear}</code> →{' '}
          <code className="text-xs">{bounds.endYear}</code>.
        </p>
      </header>

      <DateAxis bounds={bounds} />

      <Section title={`Book subjects (${bookSubjects.length})`}>
        {bookSubjects.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No people are flagged <code>is_book_subject: true</code> yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {bookSubjects.map(person => (
              <SubjectRow
                key={person.id}
                person={person}
                bounds={bounds}
                archive={archive}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title={`Events (${archive.events.length})`}>
        <EventBand events={archive.events} bounds={bounds} />
      </Section>

      <details className="mt-8 group">
        <summary className="mb-3 cursor-pointer text-sm font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-700">
          Show external historical context
          <span className="ml-2 font-normal normal-case text-xs text-zinc-400 group-open:hidden">
            (click to expand — Famine years, Land War, WWI, etc.)
          </span>
        </summary>
        <ExternalContextBand bounds={bounds} />
      </details>

      <p className="mt-12 text-xs text-zinc-500">
        Residence bars show <em>from</em> → <em>to</em> dates from each
        person&apos;s <code>residences</code> field. Open-ended ranges
        extend to the edge of the chart. Source ticks below each
        lifeline mark the dates of clippings that link to the person.
        Hover any element for citation detail.
      </p>
    </main>
  );
}

// ---- Date axis ----------------------------------------------------------

function DateAxis({ bounds }: { bounds: TimelineBounds }) {
  const ticks = decadeTicks(bounds);
  return (
    <div className="relative mb-4 h-6 border-b border-zinc-300">
      {ticks.map(({ year, percent }) => (
        <div
          key={year}
          className="absolute top-0 -translate-x-1/2 text-xs text-zinc-500"
          style={{ left: `${percent}%` }}
        >
          <span className="absolute -bottom-1 left-1/2 h-2 w-px -translate-x-1/2 bg-zinc-300" />
          {year}
        </div>
      ))}
    </div>
  );
}

// ---- Subject row --------------------------------------------------------

function SubjectRow({
  person,
  bounds,
  archive,
}: {
  person: PersonRecord;
  bounds: TimelineBounds;
  archive: Archive;
}) {
  const residences = person.residences ?? [];
  const sourceIds = archive.sourcesByPersonId.get(person.id) ?? [];
  const sourceTicks = sourceIds
    .map(sid => archive.sourcesById.get(sid))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map(s => ({ id: s.id, date: s.date, label: titleForSource(s) }));

  return (
    <div className="grid grid-cols-[14rem_1fr] items-center gap-3 border-b border-zinc-100 py-2">
      <div className="text-sm">
        <Link
          href={`/people/${person.id}`}
          className="font-medium hover:underline"
        >
          {person.display_name}
        </Link>
        {person.family_confidence >= 75 && (
          <span className="ml-1 text-xs text-emerald-700" title="High family confidence">
            ★
          </span>
        )}
      </div>
      <div className="relative h-8 rounded bg-zinc-50">
        {residences.map((r, i) => {
          const pos = rangeToPercent(r.date_range.from, r.date_range.to, bounds);
          if (!pos) return null;
          const opacity = Math.max(0.3, Math.min(0.9, r.confidence / 100));
          const place = archive.placesById.get(r.place);
          const placeLabel = place?.display ?? r.place;
          return (
            <div
              key={i}
              className="absolute top-1.5 h-5 overflow-hidden whitespace-nowrap rounded border border-emerald-400 bg-emerald-200/50 px-1 text-xs leading-5 text-emerald-900"
              style={{
                left: `${pos.left}%`,
                width: `${Math.max(0.5, pos.width)}%`,
                opacity,
              }}
              title={`${placeLabel}${r.address ? ` — ${r.address}` : ''} (${labelDateRange(r.date_range)}, confidence ${r.confidence})`}
            >
              {placeLabel}
              {r.address ? ` — ${r.address}` : ''}
            </div>
          );
        })}
        {sourceTicks.map(t => {
          const pct = dateToPercent(t.date, bounds);
          if (pct === null) return null;
          return (
            <Link
              key={t.id}
              href={`/sources/${t.id}`}
              className="absolute top-0 h-8 w-px bg-zinc-700/70 hover:w-0.5 hover:bg-zinc-900"
              style={{ left: `${pct}%` }}
              title={`${t.date} — ${t.label}`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---- Event band ---------------------------------------------------------

function EventBand({
  events,
  bounds,
}: {
  events: DerivedEvent[];
  bounds: TimelineBounds;
}) {
  return (
    <div className="relative h-24 rounded bg-zinc-50">
      {events.map(e => {
        const pct = dateToPercent(e.date, bounds);
        if (pct === null) return null;
        const row = hashRow(e.source_id, 3);
        return (
          <Link
            key={e.id}
            href={`/sources/${e.source_id}`}
            className="absolute h-3 w-3 -translate-x-1/2 rounded-full bg-zinc-700/80 hover:bg-zinc-900 hover:ring-2 hover:ring-zinc-900/30"
            style={{
              left: `${pct}%`,
              top: `${10 + row * 26}px`,
            }}
            title={`${e.date} — ${e.title}`}
          />
        );
      })}
    </div>
  );
}

// ---- External context ---------------------------------------------------

function ExternalContextBand({ bounds }: { bounds: TimelineBounds }) {
  return (
    <div className="relative h-28 rounded border border-zinc-200 bg-white">
      {EXTERNAL_CONTEXT.map((period, i) => {
        const pos = rangeToPercent(period.from, period.to, bounds);
        if (!pos) return null;
        const row = i % 4;
        return (
          <div
            key={period.id}
            className={`absolute h-5 overflow-hidden whitespace-nowrap rounded border px-1 text-xs leading-5 ${period.className}`}
            style={{
              left: `${pos.left}%`,
              width: `${Math.max(0.5, pos.width)}%`,
              top: `${4 + row * 24}px`,
            }}
            title={`${period.label} (${period.from} – ${period.to})`}
          >
            {period.label}
          </div>
        );
      })}
    </div>
  );
}

// ---- Helpers ------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function earliestDate(person: PersonRecord, archive: Archive): string | null {
  const fromResidences = (person.residences ?? [])
    .map(r => r.date_range.from)
    .filter((d): d is string => !!d);
  const sourceIds = archive.sourcesByPersonId.get(person.id) ?? [];
  const fromSources = sourceIds
    .map(sid => archive.sourcesById.get(sid)?.date)
    .filter((d): d is string => !!d);
  const all = [...fromResidences, ...fromSources].sort();
  return all[0] ?? null;
}

function labelDateRange(dr: { from: string | null; to: string | null }): string {
  return `${dr.from ?? '…'} → ${dr.to ?? '…'}`;
}

function titleForSource(src: Archive['sources'][number]): string {
  if (src.type === 'clipping') {
    return src.headline || src.summary.split(/[.!?]/)[0] || src.id;
  }
  return src.id;
}

function hashRow(s: string, rows: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h % rows) + rows) % rows;
}
