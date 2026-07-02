// All sources, browsable two ways:
//   1. a horizontal year/month calendar strip — scroll sideways through
//      time, sources sit in their year column under month labels
//   2. a vertical timeline rail — scroll down through the same years
// Both are pure CSS scrolling (overflow + scroll-snap + sticky), no
// client JS. Years without sources compress into slim gap markers so
// 1820→2001 stays scrollable without 180 empty columns.

import Link from 'next/link';
import { loadArchive, sourceListing } from '@/lib/data';
import type { Source } from '@/lib/data';

export const metadata = { title: 'Sources' };

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface YearBucket {
  year: number;
  // month index 0-11, or -1 for year-only dates ("1885")
  months: Map<number, Source[]>;
  count: number;
}

function groupByYearMonth(sources: Source[]): { years: YearBucket[]; undated: Source[] } {
  const byYear = new Map<number, YearBucket>();
  const undated: Source[] = [];
  for (const src of sources) {
    const m = src.date?.match(/^(\d{4})(?:-(\d{2}))?/);
    if (!m) {
      undated.push(src);
      continue;
    }
    const year = parseInt(m[1], 10);
    const month = m[2] ? parseInt(m[2], 10) - 1 : -1;
    let bucket = byYear.get(year);
    if (!bucket) {
      bucket = { year, months: new Map(), count: 0 };
      byYear.set(year, bucket);
    }
    const list = bucket.months.get(month) ?? [];
    list.push(src);
    bucket.months.set(month, list);
    bucket.count++;
  }
  const years = [...byYear.values()].sort((a, b) => a.year - b.year);
  for (const y of years) {
    for (const list of y.months.values()) {
      list.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    }
  }
  return { years, undated };
}

function sortedMonths(bucket: YearBucket): Array<[number, Source[]]> {
  return [...bucket.months.entries()].sort((a, b) => a[0] - b[0]);
}

export default function AllSourcesPage() {
  const archive = loadArchive();
  const { years, undated } = groupByYearMonth(archive.sources);
  const counts = archive.stats.sourcesByType;
  const countLine = Object.entries(counts)
    .map(([type, n]) => `${n} ${type}${n === 1 ? '' : 's'}`)
    .join(', ');

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">All sources</h1>
        <p className="mt-2 text-sm text-stone-600">
          {archive.sources.length} sources ({countLine}), {years[0]?.year}–{years[years.length - 1]?.year}.
          Scroll the calendar sideways, or the timeline below it.
        </p>
        <p className="mt-1 text-xs text-stone-500">
          <span className="mr-3 inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-stone-300 bg-paper" /> newspaper clipping
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-amber-300 bg-amber-50" /> official record / document
          </span>
        </p>
      </header>

      {/* ---- Horizontal year/month calendar strip ---- */}
      <details open className="mb-12">
        <summary className="mb-4 cursor-pointer text-sm font-semibold uppercase tracking-wide text-stone-500 hover:text-stone-700">
          Calendar — scroll sideways by year
        </summary>
        <section aria-label="Horizontal timeline">
        <div className="overflow-x-auto rounded-lg border border-amber-200/70 bg-paper/60 pb-2 [scroll-snap-type:x_proximity]">
          <div className="flex items-stretch gap-0 px-2">
            {years.map((bucket, i) => {
              const prev = years[i - 1];
              const gap = prev ? bucket.year - prev.year - 1 : 0;
              return (
                <div key={bucket.year} className="flex">
                  {gap > 0 && (
                    <div className="flex w-12 shrink-0 flex-col items-center justify-center border-r border-dashed border-stone-200 text-stone-300">
                      <span className="text-xs [writing-mode:vertical-rl]">
                        {gap} yr{gap === 1 ? '' : 's'} · no sources
                      </span>
                    </div>
                  )}
                  <div className="max-h-[26rem] w-64 shrink-0 overflow-y-auto border-r border-stone-200/80 px-3 py-3 [scroll-snap-align:start]">
                    <h2 className="sticky top-0 z-10 -mx-3 mb-2 bg-paper px-3 pb-1 text-base font-semibold text-stone-900">
                      {bucket.year}
                      <span className="ml-2 text-xs font-normal text-stone-400">
                        {bucket.count} source{bucket.count === 1 ? '' : 's'}
                      </span>
                    </h2>
                    <div className="space-y-3">
                      {sortedMonths(bucket).map(([month, items]) => (
                        <div key={month}>
                          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800/80">
                            {month === -1 ? 'date to the year' : MONTH_NAMES[month]}
                          </h3>
                          <ul className="space-y-1.5">
                            {items.map(src => (
                              <CalendarCard key={src.id} source={src} />
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {undated.length > 0 && (
              <div className="max-h-[26rem] w-64 shrink-0 overflow-y-auto px-3 py-3 [scroll-snap-align:start]">
                <h2 className="sticky top-0 z-10 -mx-3 mb-2 bg-paper px-3 pb-1 text-base font-semibold text-stone-500">Undated</h2>
                <ul className="space-y-1.5">
                  {undated.map(src => (
                    <CalendarCard key={src.id} source={src} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        </section>
      </details>

      {/* ---- Vertical timeline rail ---- */}
      <details open className="mx-auto block max-w-3xl">
        <summary className="mb-4 cursor-pointer text-sm font-semibold uppercase tracking-wide text-stone-500 hover:text-stone-700">
          Timeline, oldest first
        </summary>
        <section aria-label="Vertical timeline">
        <div className="relative border-l-2 border-amber-300/70 pl-6">
          {years.map(bucket => (
            <div key={bucket.year} className="relative mb-8">
              <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-amber-400 bg-paper" aria-hidden />
              <h3 className="sticky top-0 z-10 -mx-2 bg-background/95 px-2 py-1 text-lg font-semibold text-stone-900">
                {bucket.year}
              </h3>
              {sortedMonths(bucket).map(([month, items]) => (
                <div key={month} className="mt-2">
                  {month !== -1 && (
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-amber-800/80">
                      {MONTH_NAMES[month]}
                    </h4>
                  )}
                  <ul className="mt-1 space-y-2">
                    {items.map(src => {
                      const { title, citation } = sourceListing(src);
                      return (
                        <li key={src.id} className="border-l-2 border-stone-200 pl-3 text-sm">
                          <Link href={`/sources/${src.id}`} className="font-medium hover:underline">
                            {citation}
                          </Link>
                          {title && <span className="ml-2 text-stone-700">{title}</span>}
                          {src.summary && (
                            <p className="mt-0.5 text-xs text-stone-600">
                              {src.summary.slice(0, 160)}
                              {src.summary.length > 160 && '…'}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ))}
          {undated.length > 0 && (
            <div className="relative mb-8">
              <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-stone-300 bg-paper" aria-hidden />
              <h3 className="text-lg font-semibold text-stone-500">Undated</h3>
              <ul className="mt-1 space-y-2">
                {undated.map(src => {
                  const { title, citation } = sourceListing(src);
                  return (
                    <li key={src.id} className="border-l-2 border-stone-200 pl-3 text-sm">
                      <Link href={`/sources/${src.id}`} className="font-medium hover:underline">
                        {citation}
                      </Link>
                      {title && <span className="ml-2 text-stone-700">{title}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        </section>
      </details>
    </main>
  );
}

// Compact card for the calendar strip — paper for clippings, amber
// tint for official records, full citation on the detail page.
function CalendarCard({ source }: { source: Source }) {
  const { title, citation } = sourceListing(source);
  const label = title || citation;
  const isDocument = source.type === 'document';
  return (
    <li>
      <Link
        href={`/sources/${source.id}`}
        className={`block rounded border px-2 py-1.5 text-xs leading-snug transition-colors ${
          isDocument
            ? 'border-amber-300 bg-amber-50 hover:border-amber-500'
            : 'border-stone-300 bg-paper hover:border-stone-500'
        }`}
        title={`${citation}${title ? ` — ${title}` : ''}`}
      >
        <span className="block font-medium text-stone-800">
          {label.length > 64 ? label.slice(0, 63) + '…' : label}
        </span>
        <span className="mt-0.5 block text-[10px] text-stone-500">
          {source.date ?? 'undated'}
          {isDocument ? ' · record' : ''}
        </span>
      </Link>
    </li>
  );
}
