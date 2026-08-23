/**
 * Review scheduler — transparent, testable, and deliberately conservative.
 *
 * Shape borrowed from FSRS: a published power forgetting curve with few
 * parameters, chosen because a teacher can be shown *why* an item is due.
 * We do not start with deep knowledge tracing; an opaque model that cannot
 * explain itself cannot be defended to the adult responsible for a child.
 *
 * Deterministic: no clock, no randomness. Time is always an argument.
 */
import type { EpochMs } from "./types.js";
import { MS_PER_DAY } from "./types.js";

export const SCHEDULER_VERSION = "athar-scheduler/1.0.0";

/** Forgetting-curve constants (FSRS 4.5/5 form). */
const F = 19 / 81;
const C = -0.5;

/**
 * Tunable parameters. Versioned with the scheduler: changing any value
 * requires a version bump so historical decisions stay reproducible.
 */
export const params = {
  /** Retention we aim for when choosing the next interval. */
  targetRetention: 0.9,
  /** Stability (days) granted by a clean first verification. */
  initialStabilityClean: 3,
  /** Stability (days) granted by a verification with a minor slip. */
  initialStabilityMinorSlip: 1.5,
  /** Scales how much a success grows stability. */
  successGrowth: 12,
  /** A hesitant success grows stability at this fraction of a clean one. */
  hesitantGrowthFactor: 0.5,
  /** Stability retained after a lapse. */
  lapseRetentionFactor: 0.35,
  /** Hard ceiling on growth from any single review. */
  maxStabilityGrowth: 3,
  minStabilityDays: 1,
  maxStabilityDays: 180,
  minIntervalDays: 1,
  maxIntervalDays: 180,
  /** Difficulty scale and its per-grade deltas. */
  initialDifficulty: 5,
  minDifficulty: 1,
  maxDifficulty: 10,
  difficultyDelta: { again: 1.0, hard: 0.3, good: -0.2 },
  /** Pull toward initial difficulty each review; damps runaway drift. */
  difficultyMeanReversion: 0.05,
  /** Predicted recall below this marks a target fragile. */
  fragileRetrievabilityFloor: 0.7,
} as const;

/**
 * Grades are *derived from evidence*, never self-reported.
 *
 * There is deliberately no "easy" grade: self-reported ease is the most
 * gameable input in spaced repetition, and children game it.
 */
export type Grade = "again" | "hard" | "good";

export function gradeFromEvidence(correct: boolean, hesitant: boolean): Grade {
  if (!correct) return "again";
  return hesitant ? "hard" : "good";
}

export interface SchedulingState {
  /** Days at which predicted recall equals the target retention. */
  stabilityDays: number;
  /** 1 (easy) .. 10 (hard). */
  difficulty: number;
  lastReviewedAt: EpochMs;
  nextReviewAt: EpochMs;
  algorithmVersion: string;
}

export interface SchedulingDecision extends SchedulingState {
  intervalDays: number;
  /** Predicted recall at the moment this review happened. */
  retrievabilityAtReview: number;
  grade: Grade;
  /** Human-readable, persisted, and shown to teachers. */
  reason: string;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Predicted probability of recall after `elapsedDays` at a given stability. */
export function retrievability(stabilityDays: number, elapsedDays: number): number {
  if (stabilityDays <= 0) return 0;
  if (elapsedDays <= 0) return 1;
  return Math.pow(1 + F * (elapsedDays / stabilityDays), C);
}

/**
 * Interval that lands predicted recall on `targetRetention`.
 * At the default 0.9 this equals stability exactly, which is what makes
 * "stability 6 days" legible as "we expect ~90% recall in 6 days".
 */
export function intervalForRetention(
  stabilityDays: number,
  targetRetention: number = params.targetRetention,
): number {
  return (stabilityDays / F) * (Math.pow(targetRetention, 1 / C) - 1);
}

/** Stability granted when a human verifier first approves the recitation. */
export function initialState(
  verifiedCleanly: boolean,
  verifiedAt: EpochMs,
): SchedulingState {
  const stabilityDays = verifiedCleanly
    ? params.initialStabilityClean
    : params.initialStabilityMinorSlip;
  const intervalDays = clamp(
    intervalForRetention(stabilityDays),
    params.minIntervalDays,
    params.maxIntervalDays,
  );
  return {
    stabilityDays,
    difficulty: params.initialDifficulty,
    lastReviewedAt: verifiedAt,
    nextReviewAt: verifiedAt + Math.round(intervalDays * MS_PER_DAY),
    algorithmVersion: SCHEDULER_VERSION,
  };
}

function nextDifficulty(difficulty: number, grade: Grade): number {
  const moved = difficulty + params.difficultyDelta[grade];
  const reverted =
    moved + (params.initialDifficulty - moved) * params.difficultyMeanReversion;
  return clamp(reverted, params.minDifficulty, params.maxDifficulty);
}

function nextStability(
  state: SchedulingState,
  grade: Grade,
  retrievabilityAtReview: number,
): number {
  if (grade === "again")
    return clamp(
      state.stabilityDays * params.lapseRetentionFactor,
      params.minStabilityDays,
      state.stabilityDays,
    );

  // Easier items grow faster; more-overdue items grow faster (spacing
  // effect); hesitant recall grows at a reduced rate.
  const difficultyFactor =
    (params.maxDifficulty + 1 - state.difficulty) / params.maxDifficulty;
  const spacingFactor = 1 - retrievabilityAtReview;
  const hesitancyFactor = grade === "hard" ? params.hesitantGrowthFactor : 1;

  const growth =
    1 +
    params.successGrowth * difficultyFactor * spacingFactor * hesitancyFactor;

  const clampedGrowth = Math.min(growth, params.maxStabilityGrowth);
  return clamp(
    state.stabilityDays * clampedGrowth,
    params.minStabilityDays,
    params.maxStabilityDays,
  );
}

function explain(
  grade: Grade,
  elapsedDays: number,
  before: number,
  after: number,
  intervalDays: number,
  growthWasClamped: boolean,
): string {
  const d = (n: number) => round2(n);
  const head =
    grade === "again"
      ? `Recall failed after ${d(elapsedDays)}d.`
      : grade === "hard"
        ? `Recall succeeded but was hesitant after ${d(elapsedDays)}d.`
        : `Clean recall after ${d(elapsedDays)}d.`;
  const body = `Stability ${d(before)}d → ${d(after)}d; next review in ${d(intervalDays)}d.`;
  const tail = growthWasClamped
    ? ` Growth was capped at ${params.maxStabilityGrowth}× by policy.`
    : "";
  return `${head} ${body}${tail}`;
}

/**
 * Apply one review outcome.
 *
 * Callers must only pass *independent* recall evidence. Assisted and
 * scaffolded attempts never reach the scheduler — enforced upstream by
 * `classifyAttempt` and asserted by tests.
 */
export function review(
  state: SchedulingState,
  outcome: { correct: boolean; hesitant: boolean; occurredAt: EpochMs },
): SchedulingDecision {
  const elapsedDays = Math.max(
    0,
    (outcome.occurredAt - state.lastReviewedAt) / MS_PER_DAY,
  );
  const grade = gradeFromEvidence(outcome.correct, outcome.hesitant);
  const r = retrievability(state.stabilityDays, elapsedDays);

  const difficulty = nextDifficulty(state.difficulty, grade);
  const stabilityDays = nextStability(state, grade, r);
  const growthWasClamped =
    grade !== "again" &&
    stabilityDays >= state.stabilityDays * params.maxStabilityGrowth - 1e-9 &&
    stabilityDays < params.maxStabilityDays;

  const intervalDays = clamp(
    intervalForRetention(stabilityDays),
    params.minIntervalDays,
    params.maxIntervalDays,
  );

  return {
    stabilityDays,
    difficulty,
    lastReviewedAt: outcome.occurredAt,
    nextReviewAt: outcome.occurredAt + Math.round(intervalDays * MS_PER_DAY),
    algorithmVersion: SCHEDULER_VERSION,
    intervalDays,
    retrievabilityAtReview: r,
    grade,
    reason: explain(
      grade,
      elapsedDays,
      state.stabilityDays,
      stabilityDays,
      intervalDays,
      growthWasClamped,
    ),
  };
}

/** Predicted recall for a target at an arbitrary future moment. */
export function predictRecall(state: SchedulingState, at: EpochMs): number {
  return retrievability(
    state.stabilityDays,
    Math.max(0, (at - state.lastReviewedAt) / MS_PER_DAY),
  );
}

/** Whether predicted recall has fallen far enough to flag the memory fragile. */
export function isFragile(state: SchedulingState, at: EpochMs): boolean {
  return predictRecall(state, at) < params.fragileRetrievabilityFloor;
}
