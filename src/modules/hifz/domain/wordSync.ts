/**
 * Word-level audio sync.
 *
 * Timings are **measured**, never estimated. They come from the content package as
 * real per-word boundaries produced against a real reciter's audio. If a recitation
 * has no timings, every API here says `no_timings` and the muṣḥaf page simply does
 * not highlight — it never interpolates a plausible-looking sweep from the āyah
 * duration and the word count. A highlight that is guessed is a highlight that
 * teaches the wrong word.
 *
 * `activeWordAt` runs a binary search (O(log n) per frame) so a 60 fps highlight
 * costs nothing on a cheap phone.
 *
 * Words are active over the half-open interval `[startMs, endMs)`: a position
 * exactly on a boundary belongs to the word that is starting, never to both.
 *
 * Pure: no clock, no I/O. Nothing here contains or produces scripture — a timing is
 * a word *index* into content the caller already holds.
 */

/** One measured word boundary. */
export interface WordTiming {
  readonly wordIndex: number;
  readonly startMs: number;
  readonly endMs: number;
}

/* ---------------------------------------------------------------- validation */

export type TimingProblemCode =
  | "non_finite"
  | "negative_time"
  | "non_positive_duration"
  | "non_monotonic_index"
  | "non_monotonic_time"
  | "overlap"
  | "exceeds_duration"
  | "word_count_mismatch";

export interface TimingProblem {
  readonly code: TimingProblemCode;
  /** The word the problem is about, or `null` when it is about the set as a whole. */
  readonly wordIndex: number | null;
  /** Position in the supplied array, or `-1` for set-wide problems. */
  readonly at: number;
  readonly detail: Readonly<Record<string, number>>;
}

export type TimingsValidation =
  | { readonly kind: "no_timings" }
  | {
      readonly kind: "valid";
      readonly wordCount: number;
      readonly startMs: number;
      readonly endMs: number;
      /** Milliseconds actually covered by words (silence between words excluded). */
      readonly spokenMs: number;
    }
  | { readonly kind: "invalid"; readonly problems: readonly TimingProblem[] };

export interface ValidateTimingsOptions {
  /** Measured duration of the recitation clip; timings may not run past it. */
  readonly ayahDurationMs?: number;
  /** How many words the content package says this āyah has. */
  readonly expectedWordCount?: number;
  /** Slack allowed at the end of the clip, for encoder padding. */
  readonly toleranceMs?: number;
}

const DEFAULT_TOLERANCE_MS = 50;

/**
 * Prove a timing set is usable: strictly increasing word indices, strictly positive
 * durations, no overlap, monotone time, and containment inside the clip.
 *
 * An empty set is not "invalid" — it is `no_timings`, a legitimate state for a
 * recitation nobody has aligned yet.
 */
export function validateTimings(
  timings: readonly WordTiming[],
  options: ValidateTimingsOptions = {},
): TimingsValidation {
  if (timings.length === 0) return { kind: "no_timings" };

  const tolerance = options.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  const problems: TimingProblem[] = [];
  let previous: WordTiming | null = null;
  let spokenMs = 0;

  for (const [at, timing] of timings.entries()) {
    if (
      !Number.isFinite(timing.startMs) ||
      !Number.isFinite(timing.endMs) ||
      !Number.isFinite(timing.wordIndex)
    ) {
      problems.push({ code: "non_finite", wordIndex: null, at, detail: {} });
      continue;
    }
    if (timing.startMs < 0) {
      problems.push({
        code: "negative_time",
        wordIndex: timing.wordIndex,
        at,
        detail: { startMs: timing.startMs },
      });
    }
    if (timing.endMs <= timing.startMs) {
      problems.push({
        code: "non_positive_duration",
        wordIndex: timing.wordIndex,
        at,
        detail: { startMs: timing.startMs, endMs: timing.endMs },
      });
    } else {
      spokenMs += timing.endMs - timing.startMs;
    }
    if (options.ayahDurationMs !== undefined && timing.endMs > options.ayahDurationMs + tolerance) {
      problems.push({
        code: "exceeds_duration",
        wordIndex: timing.wordIndex,
        at,
        detail: { endMs: timing.endMs, ayahDurationMs: options.ayahDurationMs },
      });
    }
    if (previous !== null) {
      if (timing.wordIndex <= previous.wordIndex) {
        problems.push({
          code: "non_monotonic_index",
          wordIndex: timing.wordIndex,
          at,
          detail: { previousWordIndex: previous.wordIndex },
        });
      }
      if (timing.startMs < previous.startMs) {
        problems.push({
          code: "non_monotonic_time",
          wordIndex: timing.wordIndex,
          at,
          detail: { startMs: timing.startMs, previousStartMs: previous.startMs },
        });
      } else if (timing.startMs < previous.endMs) {
        problems.push({
          code: "overlap",
          wordIndex: timing.wordIndex,
          at,
          detail: { startMs: timing.startMs, previousEndMs: previous.endMs },
        });
      }
    }
    previous = timing;
  }

  if (options.expectedWordCount !== undefined && options.expectedWordCount !== timings.length) {
    problems.push({
      code: "word_count_mismatch",
      wordIndex: null,
      at: -1,
      detail: { expected: options.expectedWordCount, actual: timings.length },
    });
  }

  if (problems.length > 0) return { kind: "invalid", problems };

  const first = timings[0];
  const last = timings[timings.length - 1];
  if (first === undefined || last === undefined) return { kind: "no_timings" };
  return {
    kind: "valid",
    wordCount: timings.length,
    startMs: first.startMs,
    endMs: last.endMs,
    spokenMs,
  };
}

/** True when the set is usable for highlighting. */
export function hasUsableTimings(
  timings: readonly WordTiming[],
  options: ValidateTimingsOptions = {},
): boolean {
  return validateTimings(timings, options).kind === "valid";
}

/* -------------------------------------------------------------------- lookup */

export type ActiveWordResult =
  | { readonly kind: "no_timings" }
  | { readonly kind: "active"; readonly wordIndex: number; readonly timing: WordTiming }
  | {
      /**
       * The position is real but no word owns it — before the first word, in a pause
       * between two, or after the last. The neighbours are reported so a caller can
       * show the gap honestly; nothing is interpolated across it.
       */
      readonly kind: "silence";
      readonly beforeWordIndex: number | null;
      readonly afterWordIndex: number | null;
    };

/**
 * Index of the last timing that starts at or before `positionMs`, or `-1`.
 *
 * Binary search: O(log n). Exported so the search itself can be tested directly.
 * Assumes timings sorted by `startMs` — i.e. a set that passed `validateTimings`.
 */
export function searchTimingIndex(timings: readonly WordTiming[], positionMs: number): number {
  let low = 0;
  let high = timings.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const candidate = timings[middle];
    if (candidate === undefined) break;
    if (candidate.startMs <= positionMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/**
 * The word playing at `positionMs`.
 *
 * With no timings this returns `no_timings`, always — never a word index derived
 * from dividing the duration by the word count.
 */
export function activeWordAt(
  timings: readonly WordTiming[],
  positionMs: number,
): ActiveWordResult {
  if (timings.length === 0) return { kind: "no_timings" };
  if (!Number.isFinite(positionMs)) {
    const first = timings[0];
    return {
      kind: "silence",
      beforeWordIndex: null,
      afterWordIndex: first === undefined ? null : first.wordIndex,
    };
  }

  const at = searchTimingIndex(timings, positionMs);
  if (at < 0) {
    const first = timings[0];
    return {
      kind: "silence",
      beforeWordIndex: null,
      afterWordIndex: first === undefined ? null : first.wordIndex,
    };
  }

  const timing = timings[at];
  if (timing === undefined) return { kind: "no_timings" };
  if (positionMs < timing.endMs) {
    return { kind: "active", wordIndex: timing.wordIndex, timing };
  }
  const next = timings[at + 1];
  return {
    kind: "silence",
    beforeWordIndex: timing.wordIndex,
    afterWordIndex: next === undefined ? null : next.wordIndex,
  };
}

/**
 * The active word index, or `null` for both "no timings" and "silence".
 *
 * Convenience for a render loop that only wants to know what to underline. Callers
 * that must distinguish "unaligned recitation" from "a pause" use `activeWordAt`.
 */
export function activeWordIndexAt(
  timings: readonly WordTiming[],
  positionMs: number,
): number | null {
  const result = activeWordAt(timings, positionMs);
  return result.kind === "active" ? result.wordIndex : null;
}

/** When the highlight next changes, so a caller can sleep until then. */
export function nextBoundaryMs(
  timings: readonly WordTiming[],
  positionMs: number,
): number | null {
  if (timings.length === 0) return null;
  const at = searchTimingIndex(timings, positionMs);
  if (at < 0) {
    const first = timings[0];
    return first === undefined ? null : first.startMs;
  }
  const timing = timings[at];
  if (timing === undefined) return null;
  if (positionMs < timing.endMs) return timing.endMs;
  const next = timings[at + 1];
  return next === undefined ? null : next.startMs;
}
