/**
 * The Practice Lab.
 *
 * Optional practice: listening-span training, similar-āyah challenges,
 * class accuracy games, whole-muṣḥaf reading. Useful, enjoyable, and
 * structurally incapable of touching memorization state.
 *
 * The guarantee is made by construction, not by discipline. Nothing in
 * this module returns a learning state, an evidence class, or a
 * scheduling decision — there is no shape it could return that the memory
 * engine would accept. A test greps the module to keep it that way.
 *
 * Two further rules from §11 and §10:
 *  - accuracy always outranks speed;
 *  - children are never ranked publicly by speed, errors, or volume.
 */
import type { EpochMs } from "./types.js";

export const PRACTICE_LAB_VERSION = "athar-practice-lab/1.0.0";

export type ActivityKind =
  | "listening_span"
  | "similar_ayah_discrimination"
  | "class_accuracy_game"
  | "whole_mushaf_reading";

export interface PracticeAttempt {
  activity: ActivityKind;
  learnerId: string;
  occurredAt: EpochMs;
  correct: boolean;
  /** Recorded for the learner's own interest. Never ranked on. */
  elapsedMs: number;
}

/**
 * The only thing a Practice Lab session produces.
 *
 * Deliberately not shaped like evidence: no scaffold level, no start
 * context, no assistance list, no evidence class. It cannot be passed to
 * `classifyAttempt` or to the scheduler, because it does not have the
 * fields either one needs.
 */
export interface PracticeSummary {
  activity: ActivityKind;
  attempted: number;
  correct: number;
  /** Median, not mean: one interruption should not define the session. */
  medianElapsedMs: number | undefined;
  /** Stated in words, with the denominator, as everywhere else. */
  statement: string;
  /** Always true. Present so a caller reading the type sees the rule. */
  affectsMemorizationState: false;
  version: string;
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
    : (sorted[middle] ?? 0);
}

export function summarize(
  activity: ActivityKind,
  attempts: readonly PracticeAttempt[],
): PracticeSummary {
  const correct = attempts.filter((a) => a.correct).length;
  return {
    activity,
    attempted: attempts.length,
    correct,
    medianElapsedMs: median(attempts.map((a) => a.elapsedMs)),
    statement:
      attempts.length === 0
        ? "No practice recorded in this session."
        : `${correct} of ${attempts.length} correct.`,
    affectsMemorizationState: false,
    version: PRACTICE_LAB_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Class results
// ---------------------------------------------------------------------------

export interface ClassResult {
  learnerId: string;
  correct: number;
  attempted: number;
  medianElapsedMs: number | undefined;
}

/**
 * A class board that is not a leaderboard.
 *
 * Sorted by accuracy, and only ever by accuracy — speed never orders it.
 * Positions are not returned, and neither are names: the caller is handed
 * accuracy with its denominator and nothing to rank on.
 */
export interface ClassBoard {
  /** Sorted by accuracy, then by learner id for stability. */
  rows: readonly {
    learnerId: string;
    correct: number;
    attempted: number;
    statement: string;
  }[];
  /** Class-wide accuracy, for the teacher's own read. */
  classStatement: string;
  /** Present so the rule is visible in the type, not only in a comment. */
  ranked: false;
}

export function buildClassBoard(results: readonly ClassResult[]): ClassBoard {
  const rows = [...results]
    .sort(
      (a, b) =>
        // Accuracy outranks speed. Elapsed time is not in this comparator
        // at all, so it cannot creep into the ordering later.
        b.correct / Math.max(1, b.attempted) - a.correct / Math.max(1, a.attempted) ||
        a.learnerId.localeCompare(b.learnerId),
    )
    .map((r) => ({
      learnerId: r.learnerId,
      correct: r.correct,
      attempted: r.attempted,
      statement: `${r.correct} of ${r.attempted} correct`,
    }));

  const totalCorrect = results.reduce((n, r) => n + r.correct, 0);
  const totalAttempted = results.reduce((n, r) => n + r.attempted, 0);

  return {
    rows,
    classStatement:
      totalAttempted === 0
        ? "No practice recorded for this class yet."
        : `${totalCorrect} of ${totalAttempted} correct across the class.`,
    ranked: false,
  };
}

// ---------------------------------------------------------------------------
// Listening span
// ---------------------------------------------------------------------------

export interface ListeningSpanState {
  /** How many items the learner is holding at once. */
  span: number;
  consecutiveCorrect: number;
}

export const listeningSpanParams = {
  startingSpan: 2,
  maxSpan: 9,
  correctToAdvance: 3,
} as const;

export const initialListeningSpan: ListeningSpanState = {
  span: listeningSpanParams.startingSpan,
  consecutiveCorrect: 0,
};

/**
 * Adjust the span.
 *
 * Rises on sustained accuracy and falls immediately on a miss, so a
 * learner is never left grinding at a level they cannot hold. This is a
 * difficulty setting for a game, not a claim about memory.
 */
export function adjustSpan(
  state: ListeningSpanState,
  correct: boolean,
): ListeningSpanState {
  if (!correct)
    return {
      span: Math.max(listeningSpanParams.startingSpan, state.span - 1),
      consecutiveCorrect: 0,
    };

  const streak = state.consecutiveCorrect + 1;
  if (streak < listeningSpanParams.correctToAdvance)
    return { ...state, consecutiveCorrect: streak };

  return {
    span: Math.min(listeningSpanParams.maxSpan, state.span + 1),
    consecutiveCorrect: 0,
  };
}
