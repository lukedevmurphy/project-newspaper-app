// Date-axis positioning utilities for the timeline-explorer page.
// All functions return percentage offsets (0–100) so the rendered
// HTML scales with the container's CSS width.

/**
 * Parse an ISO-ish date string (yyyy, yyyy-mm, yyyy-mm-dd) into a
 * decimal year (e.g. "1881-12-15" → 1881.953). Returns null for
 * unparseable input.
 */
export function decimalYear(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(p => parseInt(p, 10));
  if (Number.isNaN(parts[0])) return null;
  const year = parts[0];
  const month = !Number.isNaN(parts[1]) ? parts[1] : 1;
  const day = !Number.isNaN(parts[2]) ? parts[2] : 1;
  return year + (month - 1) / 12 + (day - 1) / 365;
}

/** Bounds for the timeline visualization. */
export interface TimelineBounds {
  startYear: number;
  endYear: number;
}

/** Compute bounds with a small buffer at each end. */
export function computeBounds(dates: (string | null | undefined)[], bufferYears = 3): TimelineBounds {
  const years = dates
    .map(d => decimalYear(d))
    .filter((y): y is number => y !== null);
  if (years.length === 0) return { startYear: 1846, endYear: 1925 };
  const min = Math.min(...years);
  const max = Math.max(...years);
  return {
    startYear: Math.floor(min - bufferYears),
    endYear: Math.ceil(max + bufferYears),
  };
}

/** Position a single date as a percentage (0–100) along the bounds. */
export function dateToPercent(dateStr: string | null | undefined, bounds: TimelineBounds): number | null {
  const y = decimalYear(dateStr);
  if (y === null) return null;
  const span = bounds.endYear - bounds.startYear;
  if (span <= 0) return null;
  const pct = ((y - bounds.startYear) / span) * 100;
  return Math.max(0, Math.min(100, pct));
}

/**
 * Position a date range as { left%, width% }. If `to` is null,
 * extends to the right edge. If `from` is null, extends from the
 * left edge.
 */
export function rangeToPercent(
  from: string | null | undefined,
  to: string | null | undefined,
  bounds: TimelineBounds
): { left: number; width: number } | null {
  const fromPct = from ? dateToPercent(from, bounds) : 0;
  const toPct = to ? dateToPercent(to, bounds) : 100;
  if (fromPct === null || toPct === null) return null;
  const left = Math.min(fromPct, toPct);
  const width = Math.abs(toPct - fromPct);
  return { left, width };
}

/** Render decade tick positions for the axis label row. */
export function decadeTicks(bounds: TimelineBounds): Array<{ year: number; percent: number }> {
  const ticks: Array<{ year: number; percent: number }> = [];
  const firstDecade = Math.ceil(bounds.startYear / 10) * 10;
  for (let y = firstDecade; y <= bounds.endYear; y += 10) {
    const pct = dateToPercent(`${y}-01-01`, bounds);
    if (pct !== null) ticks.push({ year: y, percent: pct });
  }
  return ticks;
}
