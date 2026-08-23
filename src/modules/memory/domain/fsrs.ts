/**
 * FSRS-lite — the ḥifẓ scheduler.
 *
 * A compact implementation of FSRS-4.5 (Free Spaced Repetition Scheduler), with two
 * Itqān-specific dials layered on top: an evidence weight and a retrieval-strength
 * factor per `RetrievalType` (see `SchedulingPolicy`).
 *
 * Formulas (FSRS-4.5, Jarrett Ye / open-spaced-repetition; `w0 … w16` are weights):
 *
 *   Power forgetting curve
 *     R(t, S) = (1 + FACTOR · t / S) ^ DECAY,  DECAY = −0.5, FACTOR = 19/81
 *
 *   Interval for a desired retention r  (invert the curve)
 *     I(r, S) = (S / FACTOR) · (r ^ (1/DECAY) − 1)
 *     At r = 0.90 this collapses to I = S — the defining property of FSRS stability.
 *
 *   First review
 *     S₀(G) = w[G−1]
 *     D₀(G) = w4 − (G − 3) · w5
 *
 *   Difficulty update (linear step + mean reversion toward D₀(easy))
 *     D′  = D − w6 · (G − 3)
 *     D″  = w7 · D₀(4) + (1 − w7) · D′
 *
 *   Stability after a successful recall
 *     S′ = S · (1 + e^{w8} · (11 − D) · S^{−w9} · (e^{w10·(1−R)} − 1) · h · b)
 *          h = w15 when G = hard else 1;  b = w16 when G = easy else 1
 *     The bracketed term is non-negative, so a success can never *shrink* stability.
 *
 *   Stability after a lapse
 *     S_f = w11 · D^{−w12} · ((S + 1)^{w13} − 1) · e^{w14·(1−R)}
 *     capped at `postLapseStabilityRatioCap · S` so forgetting always costs.
 *
 * The stability update deliberately uses the *pre-update* difficulty, matching the
 * reference implementation.
 *
 * Determinism: no randomness lives in here. Interval fuzz is a separate, seeded
 * function (`applyFuzz`) so that stored schedules are reproducible from evidence.
 */

import { clamp, clamp01 } from "./numeric";
import { addDays, elapsedDays } from "./time";
import {
  GRADE_RATING,
  hasEvidence,
  isSuccessGrade,
  type FsrsWeights,
  type Grade,
  type MemoryState,
  type RetrievalType,
  type ReviewEvidence,
  type ReviewOutcome,
  type SchedulingPolicy,
  type UnitId,
  type UnitKind,
} from "./types";

/* ---------------------------------------------------------------- constants */

export const MIN_STABILITY = 0.01;
export const MAX_STABILITY = 36_500;
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

/** FSRS-4.5 power forgetting curve constants. */
export const FSRS_DECAY = -0.5;
export const FSRS_FACTOR = 19 / 81;

/** Confidence never decays faster than this, however small the stability. */
const MIN_CONFIDENCE_HALF_LIFE_DAYS = 1;

/** Published FSRS-4.5 default weights (w0 … w16). */
export const DEFAULT_FSRS_WEIGHTS: FsrsWeights = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];

/**
 * How much a single observation of each retrieval type licenses belief in the
 * resulting state (0..1). Recognition and listening are exposure; the teacher's ear
 * (`oral_recitation`) is the strongest single piece of evidence we ever collect.
 */
export const DEFAULT_EVIDENCE_WEIGHTS: Readonly<Record<RetrievalType, number>> = {
  listen: 0.1,
  recognition: 0.3,
  recall_first: 0.45,
  gap_fill: 0.5,
  next_ayah_cue: 0.6,
  rebuild: 0.65,
  connect_chain: 0.7,
  review_blank: 0.75,
  production: 0.8,
  oral_recitation: 0.95,
};

/**
 * Retrieval-strength multiplier applied to the FSRS stability *gain*, with
 * `recall_first` = 1.0 as the reference exercise. Harder, more productive retrieval
 * produces a more durable trace (desirable difficulty); passive exposure barely
 * moves stability at all.
 */
export const DEFAULT_RETRIEVAL_STABILITY_FACTORS: Readonly<Record<RetrievalType, number>> = {
  listen: 0.15,
  recognition: 0.4,
  gap_fill: 0.8,
  next_ayah_cue: 0.9,
  recall_first: 1,
  rebuild: 1,
  connect_chain: 1.05,
  production: 1.1,
  review_blank: 1.15,
  oral_recitation: 1.25,
};

export const DEFAULT_SCHEDULING_POLICY: SchedulingPolicy = {
  weights: DEFAULT_FSRS_WEIGHTS,
  targetRetention: 0.9,
  decay: FSRS_DECAY,
  factor: FSRS_FACTOR,
  minimumIntervalDays: 1,
  // The muṣḥaf is meant to be revisited: we cap far below FSRS's 36500-day ceiling.
  maximumIntervalDays: 365,
  postLapseStabilityRatioCap: 0.9,
  evidenceWeights: DEFAULT_EVIDENCE_WEIGHTS,
  retrievalStabilityFactors: DEFAULT_RETRIEVAL_STABILITY_FACTORS,
  confidenceHalfLifeFactor: 2,
};

/* ------------------------------------------------------------ core formulas */

function ratingOf(grade: Grade): number {
  return GRADE_RATING[grade];
}

/** S₀(G) = w[G−1], clamped. */
export function initialStability(grade: Grade, weights: FsrsWeights = DEFAULT_FSRS_WEIGHTS): number {
  const rating = ratingOf(grade);
  const raw =
    rating === 1 ? weights[0] : rating === 2 ? weights[1] : rating === 3 ? weights[2] : weights[3];
  return clamp(raw, MIN_STABILITY, MAX_STABILITY);
}

/** D₀(G) = w4 − (G − 3)·w5, clamped to [1, 10]. */
export function initialDifficulty(grade: Grade, weights: FsrsWeights = DEFAULT_FSRS_WEIGHTS): number {
  return clamp(weights[4] - (ratingOf(grade) - 3) * weights[5], MIN_DIFFICULTY, MAX_DIFFICULTY);
}

/** Linear difficulty step plus mean reversion toward D₀(easy). */
export function nextDifficulty(
  difficulty: number,
  grade: Grade,
  weights: FsrsWeights = DEFAULT_FSRS_WEIGHTS,
): number {
  const stepped = difficulty - weights[6] * (ratingOf(grade) - 3);
  const target = weights[4] - weights[5]; // D₀(easy), the reversion anchor
  const reverted = weights[7] * target + (1 - weights[7]) * stepped;
  return clamp(reverted, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

/** FSRS-4.5 recall stability. Always ≥ `stability` (the bracket is non-negative). */
export function stabilityAfterSuccess(
  difficulty: number,
  stability: number,
  retrievabilityNow: number,
  grade: Grade,
  weights: FsrsWeights = DEFAULT_FSRS_WEIGHTS,
): number {
  const hardPenalty = grade === "hard" ? weights[15] : 1;
  const easyBonus = grade === "easy" ? weights[16] : 1;
  const growth =
    Math.exp(weights[8]) *
    (11 - difficulty) *
    Math.pow(stability, -weights[9]) *
    (Math.exp(weights[10] * (1 - retrievabilityNow)) - 1) *
    hardPenalty *
    easyBonus;
  return clamp(stability * (1 + growth), MIN_STABILITY, MAX_STABILITY);
}

/** FSRS-4.5 post-lapse stability, capped so a lapse always costs stability. */
export function stabilityAfterLapse(
  difficulty: number,
  stability: number,
  retrievabilityNow: number,
  weights: FsrsWeights = DEFAULT_FSRS_WEIGHTS,
  ratioCap = DEFAULT_SCHEDULING_POLICY.postLapseStabilityRatioCap,
): number {
  const raw =
    weights[11] *
    Math.pow(difficulty, -weights[12]) *
    (Math.pow(stability + 1, weights[13]) - 1) *
    Math.exp(weights[14] * (1 - retrievabilityNow));
  return clamp(Math.min(raw, stability * ratioCap), MIN_STABILITY, MAX_STABILITY);
}

/* --------------------------------------------------------------- public API */

/**
 * Modelled probability of recall at `now`.
 *
 * Returns 0 for a unit with no recorded evidence: nothing is known, so nothing is
 * claimed (honesty rule). Callers distinguish "new" from "forgotten" with
 * `hasEvidence(state)`.
 */
export function retrievability(
  state: MemoryState,
  now: Date,
  config: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
): number {
  if (!hasEvidence(state)) return 0;
  const stability = clamp(state.stability, MIN_STABILITY, MAX_STABILITY);
  const elapsed = elapsedDays(state.lastReviewAt, now);
  return clamp01(Math.pow(1 + (config.factor * elapsed) / stability, config.decay));
}

/** Scheduled interval in days for the state's current stability (no fuzz). */
export function intervalDays(
  state: MemoryState,
  config: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
): number {
  const stability = clamp(state.stability, MIN_STABILITY, MAX_STABILITY);
  const retention = clamp(config.targetRetention, 0.5, 0.999);
  const raw = (stability / config.factor) * (Math.pow(retention, 1 / config.decay) - 1);
  return clamp(raw, config.minimumIntervalDays, config.maximumIntervalDays);
}

/** When the unit next falls due, or `null` when nothing has been recorded. */
export function dueAt(
  state: MemoryState,
  config: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
): Date | null {
  if (state.lastReviewAt === null || !hasEvidence(state)) return null;
  return addDays(state.lastReviewAt, intervalDays(state, config));
}

/** True when a recorded unit has reached its scheduled review. New units are not "due". */
export function isDue(
  state: MemoryState,
  now: Date,
  config: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
): boolean {
  const due = dueAt(state, config);
  return due !== null && due.getTime() <= now.getTime();
}

/** Days a recorded unit is past due (0 when not yet due, or nothing recorded). */
export function daysOverdue(
  state: MemoryState,
  now: Date,
  config: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
): number {
  const due = dueAt(state, config);
  if (due === null) return 0;
  return Math.max(0, (now.getTime() - due.getTime()) / 86_400_000);
}

/** A unit with nothing recorded yet — the honest zero state. */
export function emptyState(unitId: UnitId, kind: UnitKind): MemoryState {
  return {
    unitId,
    kind,
    stability: MIN_STABILITY,
    difficulty: DEFAULT_FSRS_WEIGHTS[4], // D₀(good): neutral prior, not a claim
    reps: 0,
    lapses: 0,
    lastReviewAt: null,
    lastRetrievalType: null,
    confidence: 0,
  };
}

/**
 * State after the *first* recorded review.
 *
 * The retrieval-strength factor scales the initial stability too: a first exposure
 * by `listen` must not manufacture a two-week interval.
 */
export function initialState(
  unitId: UnitId,
  kind: UnitKind,
  grade: Grade,
  now: Date,
  config: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
  retrievalType: RetrievalType = "recall_first",
): MemoryState {
  const factor = config.retrievalStabilityFactors[retrievalType];
  const stability = clamp(
    initialStability(grade, config.weights) * factor,
    MIN_STABILITY,
    MAX_STABILITY,
  );
  return {
    unitId,
    kind,
    stability,
    difficulty: initialDifficulty(grade, config.weights),
    reps: 1,
    // A first-review failure is not a lapse: nothing known was forgotten.
    lapses: 0,
    lastReviewAt: now,
    lastRetrievalType: retrievalType,
    confidence: clamp01(config.evidenceWeights[retrievalType]),
  };
}

/**
 * Confidence after one observation.
 *
 * Old evidence goes stale — it decays with a half-life proportional to the unit's
 * stability — and the new observation pulls confidence toward 1 in proportion to
 * its evidence weight. One teacher-verified recitation therefore outweighs a dozen
 * taps on a listening exercise.
 */
export function nextConfidence(
  previousConfidence: number,
  previousStability: number,
  elapsed: number,
  evidenceWeight: number,
  confidenceHalfLifeFactor: number,
): number {
  const halfLife = Math.max(
    confidenceHalfLifeFactor * Math.max(previousStability, MIN_STABILITY),
    MIN_CONFIDENCE_HALF_LIFE_DAYS,
  );
  const decayed = clamp01(previousConfidence) * Math.pow(0.5, Math.max(elapsed, 0) / halfLife);
  const accumulated = decayed + (1 - decayed) * clamp01(evidenceWeight);

  // Confidence is capped by the STRENGTH of the evidence, not just accumulated
  // from its quantity. Without this cap, thirty listens converge on the same
  // confidence as one clean recitation — and listening is not evidence of
  // recall at all, however often it is repeated. Weak evidence may hold
  // confidence where it is, and may raise it up to its own strength, but it can
  // never carry it past that. Only stronger evidence moves the ceiling.
  const ceiling = Math.max(decayed, clamp01(evidenceWeight));
  return clamp01(Math.min(accumulated, ceiling));
}

/**
 * The next memory state given one server-validated grade.
 *
 * `retrievalType` defaults to the state's last retrieval type, then to
 * `recall_first`; pass it explicitly whenever the evidence knows better.
 */
export function nextState(
  state: MemoryState,
  grade: Grade,
  now: Date,
  config: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
  retrievalType?: RetrievalType,
): MemoryState {
  const retrieval = retrievalType ?? state.lastRetrievalType ?? "recall_first";
  if (!hasEvidence(state)) {
    return initialState(state.unitId, state.kind, grade, now, config, retrieval);
  }

  const elapsed = elapsedDays(state.lastReviewAt, now);
  const recallProbability = retrievability(state, now, config);
  const previousStability = clamp(state.stability, MIN_STABILITY, MAX_STABILITY);
  const previousDifficulty = clamp(state.difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY);
  const success = isSuccessGrade(grade);

  let stability: number;
  if (success) {
    // FSRS gain, scaled by how strong this retrieval mode is. The factor is > 0, so
    // a success can never shorten the schedule.
    const fsrsStability = stabilityAfterSuccess(
      previousDifficulty,
      previousStability,
      recallProbability,
      grade,
      config.weights,
    );
    const gain = Math.max(0, fsrsStability - previousStability);
    stability = clamp(
      previousStability + gain * config.retrievalStabilityFactors[retrieval],
      MIN_STABILITY,
      MAX_STABILITY,
    );
  } else {
    // A failure is trusted at full weight, whatever exercise produced it.
    stability = stabilityAfterLapse(
      previousDifficulty,
      previousStability,
      recallProbability,
      config.weights,
      config.postLapseStabilityRatioCap,
    );
  }

  return {
    unitId: state.unitId,
    kind: state.kind,
    stability,
    difficulty: nextDifficulty(previousDifficulty, grade, config.weights),
    reps: state.reps + 1,
    lapses: state.lapses + (success ? 0 : 1),
    lastReviewAt: now,
    lastRetrievalType: retrieval,
    confidence: nextConfidence(
      state.confidence,
      previousStability,
      elapsed,
      config.evidenceWeights[retrieval],
      config.confidenceHalfLifeFactor,
    ),
  };
}

/** Apply one piece of evidence and return the full, auditable outcome. */
export function applyReview(
  state: MemoryState,
  evidence: ReviewEvidence,
  config: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
): ReviewOutcome {
  const retrievabilityBefore = retrievability(state, evidence.at, config);
  const elapsed = elapsedDays(state.lastReviewAt, evidence.at);
  const next = nextState(state, evidence.grade, evidence.at, config, evidence.retrievalType);
  const interval = intervalDays(next, config);
  return {
    unitId: state.unitId,
    previous: state,
    next,
    grade: evidence.grade,
    retrievalType: evidence.retrievalType,
    reviewedAt: evidence.at,
    elapsedDays: elapsed,
    retrievabilityBefore,
    intervalDays: interval,
    dueAt: addDays(evidence.at, interval),
    lapsed: hasEvidence(state) && !isSuccessGrade(evidence.grade),
  };
}

/* --------------------------------------------------------------------- fuzz */

/**
 * FSRS interval fuzz, kept out of the scheduler so `nextState` stays deterministic.
 *
 * `rand01` is a single draw in [0, 1) from a *seeded* generator supplied by the
 * caller — the same evidence plus the same seed always yields the same schedule.
 * Intervals below 2.5 days are never fuzzed.
 */
export function applyFuzz(
  interval: number,
  rand01: number,
  config: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
): number {
  if (interval < 2.5) return interval;
  const ranges = [
    { start: 2.5, end: 7, factor: 0.15 },
    { start: 7, end: 20, factor: 0.1 },
    { start: 20, end: Number.POSITIVE_INFINITY, factor: 0.05 },
  ] as const;
  let delta = 1;
  for (const range of ranges) {
    delta += range.factor * Math.max(0, Math.min(interval, range.end) - range.start);
  }
  const rounded = Math.round(interval);
  const min = Math.max(2, Math.round(rounded - delta));
  const max = Math.min(Math.round(rounded + delta), Math.round(config.maximumIntervalDays));
  if (max <= min) return min;
  const draw = clamp01(rand01);
  return Math.min(min + Math.floor(draw * (max - min + 1)), max);
}
