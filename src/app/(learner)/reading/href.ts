/**
 * Links into the reading surface.
 *
 * A sitting carries its id in the URL. That is deliberate: the id travels inside every
 * activity id, so the evidence of one sitting can be counted as one sitting
 * afterwards — and a learner who reloads the page mid-lesson stays in the sitting they
 * were already in rather than silently starting a second one.
 */

export const READING_ROOT = "/reading";

export function readingHref(): string {
  return READING_ROOT;
}

export function lettersHref(): string {
  return `${READING_ROOT}/letters`;
}

export function lessonHref(lessonId: string, sittingId?: string): string {
  const base = `${READING_ROOT}/lesson/${encodeURIComponent(lessonId)}`;
  return sittingId === undefined ? base : `${base}?sit=${encodeURIComponent(sittingId)}`;
}

export function reviewHref(sittingId?: string): string {
  const base = `${READING_ROOT}/review`;
  return sittingId === undefined ? base : `${base}?sit=${encodeURIComponent(sittingId)}`;
}

/** Session ids are `[A-Za-z0-9_-]`, because they have to survive an activity id. */
const SITTING_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function isSittingId(value: string): boolean {
  return SITTING_RE.test(value);
}

/**
 * A sitting id from the URL, or a fresh one.
 *
 * Minted from the clock, so it is unique per sitting without a database round trip and
 * without a random value that would change on every render.
 */
export function sittingIdFrom(value: string | undefined, now: Date = new Date()): string {
  if (value !== undefined && isSittingId(value)) return value;
  return `s${now.getTime().toString(36)}`;
}
