/**
 * Advisory recitation comparison.
 *
 * **This module never grades and never writes memory state.** It compares what an
 * on-device ASR *heard* against the words the learner was expected to recite and
 * returns an alignment. That alignment is a mirror the learner may look into and a
 * hint the teacher may glance at before listening. It is not evidence of mastery,
 * it is not a `Grade`, and nothing downstream may treat it as one — an oral
 * recitation is settled by a person's ear (`gradeAttempt` returns `requires_human`
 * for it, always). The return type carries `advisory: true` so that intent survives
 * every refactor, serialisation and log line.
 *
 * Sacred-content note: this module holds **no Arabic**. It receives two arrays of
 * opaque tokens from the caller and a `normalize` function from the caller. It never
 * inspects, reconstructs or emits scripture, and it has no idea what a letter is.
 *
 * Ḥarakah-precise, waqf-tolerant — by injection. Equality is exact on the caller's
 * normalised form, so a normalizer that preserves ḥarakāt makes the comparison
 * ḥarakah-precise. Any token whose normalised form is empty is *ignored* on both
 * sides, which is how a caller expresses waqf tolerance: map pause marks to the
 * empty string and stopping (or not stopping) can never read as an error.
 *
 * Pure: no clock, no I/O, no randomness. O(n·m) time in the token counts, refused
 * above `maxCells` rather than allowed to hang a request.
 */

import { rate, type Rate } from "@/modules/memory/domain/numeric";

export type DiffOpKind = "match" | "differs" | "missing" | "extra";

export interface DiffOp {
  readonly kind: DiffOpKind;
  /** Index into the caller's `expected` array, or `null` for an extra word. */
  readonly expectedIndex: number | null;
  /** Index into the caller's `heard` array, or `null` for a missing word. */
  readonly heardIndex: number | null;
}

/** Per expected word. `ignored` means the caller's normalizer dropped the token. */
export type ExpectedWordStatus = "match" | "differs" | "missing" | "ignored";

export interface ExpectedWord {
  readonly expectedIndex: number;
  readonly status: ExpectedWordStatus;
  /** The heard token that was aligned to it, when there was one. */
  readonly heardIndex: number | null;
}

export interface ExtraWord {
  readonly heardIndex: number;
}

export interface DiffCounts {
  readonly match: number;
  readonly differs: number;
  readonly missing: number;
  readonly extra: number;
  readonly expectedTotal: number;
  readonly heardTotal: number;
  /** Expected words actually compared (total, less ignored ones). */
  readonly compared: number;
}

/**
 * An alignment between heard and expected words. Advisory: see the module doc.
 * The `advisory: true` field is part of the type, so a value of this type can never
 * be mistaken for a grade at a call site or in a stored payload.
 */
export interface AdvisoryDiff {
  readonly advisory: true;
  readonly kind: "diff";
  readonly ops: readonly DiffOp[];
  /** One entry per expected word, in order. */
  readonly expected: readonly ExpectedWord[];
  readonly extras: readonly ExtraWord[];
  readonly counts: DiffCounts;
  /** Matches over compared expected words — with its denominator, always. */
  readonly matchRate: Rate;
  readonly ignored: { readonly expected: number; readonly heard: number };
}

/** No comparison was made, and no result is invented. Also advisory by nature. */
export interface AdvisoryNotCompared {
  readonly advisory: true;
  readonly kind: "not_compared";
  /** Stable i18n key. */
  readonly reason: string;
  readonly expectedTotal: number;
  readonly heardTotal: number;
}

export type AdvisoryDiffResult = AdvisoryDiff | AdvisoryNotCompared;

export interface ReciteDiffOptions {
  /**
   * Caller-supplied normalisation. Return the empty string to drop a token from the
   * comparison entirely (waqf marks, pause markers, silence tokens).
   */
  readonly normalize: (token: string) => string;
  /** Refuse rather than hang: default 250_000 DP cells (~500 × 500 tokens). */
  readonly maxCells?: number;
}

const DEFAULT_MAX_CELLS = 250_000;

interface KeptToken {
  readonly originalIndex: number;
  readonly normalised: string;
}

function keep(tokens: readonly string[], normalize: (token: string) => string): KeptToken[] {
  const kept: KeptToken[] = [];
  for (const [originalIndex, token] of tokens.entries()) {
    const normalised = typeof token === "string" ? normalize(token) : "";
    if (normalised.length === 0) continue;
    kept.push({ originalIndex, normalised });
  }
  return kept;
}

/**
 * Align `heard` against `expected`, word by word.
 *
 * Advisory only. Never call this to decide anything a learner's progress depends on.
 */
export function reciteDiff(
  expected: readonly string[],
  heard: readonly string[],
  options: ReciteDiffOptions,
): AdvisoryDiffResult {
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  const keptExpected = keep(expected, options.normalize);
  const keptHeard = keep(heard, options.normalize);
  const n = keptExpected.length;
  const m = keptHeard.length;

  if ((n + 1) * (m + 1) > maxCells) {
    return {
      advisory: true,
      kind: "not_compared",
      reason: "hifz.diff.too_large",
      expectedTotal: expected.length,
      heardTotal: heard.length,
    };
  }

  // Levenshtein DP over word tokens: substitution, deletion (missing), insertion (extra).
  const width = m + 1;
  const cost = new Int32Array((n + 1) * width);
  for (let i = 1; i <= n; i += 1) cost[i * width] = i;
  for (let j = 1; j <= m; j += 1) cost[j] = j;
  for (let i = 1; i <= n; i += 1) {
    const left = keptExpected[i - 1];
    for (let j = 1; j <= m; j += 1) {
      const right = keptHeard[j - 1];
      const same =
        left !== undefined && right !== undefined && left.normalised === right.normalised;
      const diagonal = (cost[(i - 1) * width + (j - 1)] ?? 0) + (same ? 0 : 1);
      const up = (cost[(i - 1) * width + j] ?? 0) + 1;
      const across = (cost[i * width + (j - 1)] ?? 0) + 1;
      cost[i * width + j] = Math.min(diagonal, up, across);
    }
  }

  // Backtrack. Diagonal first, then missing, then extra — deterministic on ties.
  const reversed: DiffOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const here = cost[i * width + j] ?? 0;
    if (i > 0 && j > 0) {
      const left = keptExpected[i - 1];
      const right = keptHeard[j - 1];
      const same =
        left !== undefined && right !== undefined && left.normalised === right.normalised;
      const diagonal = (cost[(i - 1) * width + (j - 1)] ?? 0) + (same ? 0 : 1);
      if (here === diagonal && left !== undefined && right !== undefined) {
        reversed.push({
          kind: same ? "match" : "differs",
          expectedIndex: left.originalIndex,
          heardIndex: right.originalIndex,
        });
        i -= 1;
        j -= 1;
        continue;
      }
    }
    if (i > 0 && here === (cost[(i - 1) * width + j] ?? 0) + 1) {
      const left = keptExpected[i - 1];
      reversed.push({
        kind: "missing",
        expectedIndex: left === undefined ? null : left.originalIndex,
        heardIndex: null,
      });
      i -= 1;
      continue;
    }
    const right = keptHeard[j - 1];
    reversed.push({
      kind: "extra",
      expectedIndex: null,
      heardIndex: right === undefined ? null : right.originalIndex,
    });
    j -= 1;
  }
  const ops = reversed.reverse();

  // Project onto the caller's original expected indices.
  const statuses = new Map<number, ExpectedWord>();
  for (const kept of keptExpected) {
    statuses.set(kept.originalIndex, {
      expectedIndex: kept.originalIndex,
      status: "missing",
      heardIndex: null,
    });
  }
  const extras: ExtraWord[] = [];
  let match = 0;
  let differs = 0;
  for (const op of ops) {
    if (op.kind === "extra") {
      if (op.heardIndex !== null) extras.push({ heardIndex: op.heardIndex });
      continue;
    }
    if (op.expectedIndex === null) continue;
    if (op.kind === "match") match += 1;
    if (op.kind === "differs") differs += 1;
    if (op.kind !== "missing") {
      statuses.set(op.expectedIndex, {
        expectedIndex: op.expectedIndex,
        status: op.kind,
        heardIndex: op.heardIndex,
      });
    }
  }

  const expectedWords: ExpectedWord[] = expected.map((_, index) => {
    const entry = statuses.get(index);
    return (
      entry ?? { expectedIndex: index, status: "ignored" as const, heardIndex: null }
    );
  });
  const missing = expectedWords.filter((word) => word.status === "missing").length;

  return {
    advisory: true,
    kind: "diff",
    ops,
    expected: expectedWords,
    extras,
    counts: {
      match,
      differs,
      missing,
      extra: extras.length,
      expectedTotal: expected.length,
      heardTotal: heard.length,
      compared: n,
    },
    matchRate: rate(match, n),
    ignored: { expected: expected.length - n, heard: heard.length - m },
  };
}

/** True when a value is an advisory comparison. There is no non-advisory variant. */
export function isAdvisory(value: AdvisoryDiffResult): value is AdvisoryDiffResult {
  return value.advisory === true;
}

/**
 * Expected word indices worth a second look, worst first — advisory hints for the
 * learner's own review, never inputs to a grade.
 */
export function advisoryWeakSpots(diff: AdvisoryDiffResult): readonly number[] {
  if (diff.kind !== "diff") return [];
  return diff.expected
    .filter((word) => word.status === "missing" || word.status === "differs")
    .map((word) => word.expectedIndex);
}
