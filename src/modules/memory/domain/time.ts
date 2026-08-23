/**
 * Date helpers for the memory engine.
 *
 * The engine never reads the clock itself — callers pass `now: Date`, which comes
 * from server-validated evidence. These helpers only convert between `Date` and
 * fractional days.
 */

export const MS_PER_DAY = 86_400_000;

/** Fractional days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

/** Elapsed days from `from` to `to`, never negative (clock skew is not evidence). */
export function elapsedDays(from: Date | null, to: Date): number {
  if (from === null) return 0;
  const delta = daysBetween(from, to);
  return delta > 0 ? delta : 0;
}

/** A new `Date` `days` (may be fractional or negative) after `at`. */
export function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * MS_PER_DAY);
}

/** Midnight UTC of the day containing `at`. Used to bucket a day's session load. */
export function startOfUtcDay(at: Date): Date {
  return new Date(Math.floor(at.getTime() / MS_PER_DAY) * MS_PER_DAY);
}

/** Whole-day index of `at` relative to `origin` (floor of the fractional difference). */
export function dayIndex(origin: Date, at: Date): number {
  return Math.floor(daysBetween(startOfUtcDay(origin), at));
}
