/**
 * Bayesian Knowledge Tracing — the reading (Qāʿidah) model.
 *
 * Reading concepts are discrete skills ("this letter with this vowel"), practised in
 * many short items. BKT tracks P(known) per concept from correct/incorrect evidence
 * (Corbett & Anderson, 1994):
 *
 *   predict    P(correct) = p·(1 − slip) + (1 − p)·guess
 *   posterior  P(known | correct)   = p·(1 − slip) / [p·(1 − slip) + (1 − p)·guess]
 *              P(known | incorrect) = p·slip / [p·slip + (1 − p)·(1 − guess)]
 *   learn      p′ = posterior + (1 − posterior)·transit
 *
 * Probabilities are kept strictly inside (0, 1): certainty is never claimed from a
 * finite number of observations (honesty rule).
 *
 * `bktToMemoryState` bridges a concept into the shared `MemoryState` shape so the
 * ink-depth meters, the policy and the teacher inbox speak one language. Stability
 * is a strictly monotone function of P(known) — it is a *presentation* of mastery,
 * not an FSRS quantity, and reading concepts are never scheduled by FSRS.
 */

import { clamp, clamp01 } from "./numeric";
import {
  reason,
  type MemoryState,
  type Reason,
  type RetrievalType,
  type UnitId,
} from "./types";

/** Probabilities are held inside (ε, 1 − ε): no observation ever proves certainty. */
export const PROBABILITY_EPSILON = 1e-6;

export interface BktParams {
  /** P(known) before any evidence. */
  readonly pInit: number;
  /** P(learned on this opportunity | not yet known). */
  readonly pTransit: number;
  /** P(incorrect | known) — a careless miss. */
  readonly pSlip: number;
  /** P(correct | not known) — a lucky answer. */
  readonly pGuess: number;
}

/**
 * Defaults for Qāʿidah recognition items.
 *
 * `pInit` 0.15 — a learner entering the curriculum rarely knows the concept already.
 * `pTransit` 0.22 — the classic 0.1–0.3 band for a deliberate practice opportunity.
 * `pSlip` 0.10 — careless misreads happen even when the concept is known.
 * `pGuess` 0.20 — a five-way recognition choice. Production items should override
 * this downward (see `DEFAULT_CONCEPT_OVERRIDES` for the shape).
 */
export const DEFAULT_BKT_PARAMS: BktParams = {
  pInit: 0.15,
  pTransit: 0.22,
  pSlip: 0.1,
  pGuess: 0.2,
};

/** Per-concept parameter overrides, keyed by concept unit id (`c:...`). */
export type BktParamOverrides = Readonly<Record<UnitId, Partial<BktParams>>>;

export const DEFAULT_CONCEPT_OVERRIDES: BktParamOverrides = {};

export interface BktState {
  readonly conceptId: UnitId;
  readonly pKnown: number;
  readonly observations: number;
  readonly correctObservations: number;
  readonly lastSeenAt: Date | null;
  readonly lastRetrievalType: RetrievalType | null;
}

export type BktParamErrorCode =
  | "p_init_out_of_range"
  | "p_transit_out_of_range"
  | "p_slip_out_of_range"
  | "p_guess_out_of_range"
  | "degenerate_model";

export interface BktParamError {
  readonly code: BktParamErrorCode;
  readonly reason: Reason;
}

/**
 * Report (never throw) parameter problems. `degenerate_model` is the Baker et al.
 * condition: with slip + guess ≥ 1 the model reads evidence backwards.
 */
export function validateBktParams(params: BktParams): readonly BktParamError[] {
  const errors: BktParamError[] = [];
  const inUnit = (value: number): boolean => value > 0 && value < 1;
  if (!inUnit(params.pInit)) {
    errors.push({
      code: "p_init_out_of_range",
      reason: reason("memory.bkt.error.p_init_out_of_range", { value: params.pInit }),
    });
  }
  if (params.pTransit <= 0 || params.pTransit >= 1) {
    errors.push({
      code: "p_transit_out_of_range",
      reason: reason("memory.bkt.error.p_transit_out_of_range", { value: params.pTransit }),
    });
  }
  if (!inUnit(params.pSlip)) {
    errors.push({
      code: "p_slip_out_of_range",
      reason: reason("memory.bkt.error.p_slip_out_of_range", { value: params.pSlip }),
    });
  }
  if (!inUnit(params.pGuess)) {
    errors.push({
      code: "p_guess_out_of_range",
      reason: reason("memory.bkt.error.p_guess_out_of_range", { value: params.pGuess }),
    });
  }
  if (params.pSlip + params.pGuess >= 1) {
    errors.push({
      code: "degenerate_model",
      reason: reason("memory.bkt.error.degenerate_model", {
        pSlip: params.pSlip,
        pGuess: params.pGuess,
      }),
    });
  }
  return errors;
}

/** Merge per-concept overrides onto the defaults, clamped into the open unit interval. */
export function paramsFor(
  conceptId: UnitId,
  defaults: BktParams = DEFAULT_BKT_PARAMS,
  overrides: BktParamOverrides = DEFAULT_CONCEPT_OVERRIDES,
): BktParams {
  const override = overrides[conceptId];
  const merged: BktParams = override === undefined ? defaults : { ...defaults, ...override };
  return {
    pInit: clamp(merged.pInit, PROBABILITY_EPSILON, 1 - PROBABILITY_EPSILON),
    pTransit: clamp(merged.pTransit, PROBABILITY_EPSILON, 1 - PROBABILITY_EPSILON),
    pSlip: clamp(merged.pSlip, PROBABILITY_EPSILON, 1 - PROBABILITY_EPSILON),
    pGuess: clamp(merged.pGuess, PROBABILITY_EPSILON, 1 - PROBABILITY_EPSILON),
  };
}

/** P(correct) for the next item, given current mastery. */
export function predict(pKnown: number, params: BktParams = DEFAULT_BKT_PARAMS): number {
  const p = clampProbability(pKnown);
  return clamp01(p * (1 - params.pSlip) + (1 - p) * params.pGuess);
}

/** Bayes update of P(known) from one observation, before the learning step. */
export function posterior(
  pKnown: number,
  correct: boolean,
  params: BktParams = DEFAULT_BKT_PARAMS,
): number {
  const p = clampProbability(pKnown);
  const numerator = correct ? p * (1 - params.pSlip) : p * params.pSlip;
  const evidence = correct
    ? numerator + (1 - p) * params.pGuess
    : numerator + (1 - p) * (1 - params.pGuess);
  if (evidence <= 0) return p;
  return clampProbability(numerator / evidence);
}

/** Posterior plus the learning opportunity: p′ = post + (1 − post)·pTransit. */
export function updatePKnown(
  pKnown: number,
  correct: boolean,
  params: BktParams = DEFAULT_BKT_PARAMS,
): number {
  const post = posterior(pKnown, correct, params);
  return clampProbability(post + (1 - post) * params.pTransit);
}

export function initialBktState(
  conceptId: UnitId,
  params: BktParams = DEFAULT_BKT_PARAMS,
): BktState {
  return {
    conceptId,
    pKnown: clampProbability(params.pInit),
    observations: 0,
    correctObservations: 0,
    lastSeenAt: null,
    lastRetrievalType: null,
  };
}

/** Apply one server-validated observation to a concept state. */
export function update(
  state: BktState,
  correct: boolean,
  params: BktParams = DEFAULT_BKT_PARAMS,
  observedAt: Date | null = null,
  retrievalType: RetrievalType | null = null,
): BktState {
  return {
    conceptId: state.conceptId,
    pKnown: updatePKnown(state.pKnown, correct, params),
    observations: state.observations + 1,
    correctObservations: state.correctObservations + (correct ? 1 : 0),
    lastSeenAt: observedAt ?? state.lastSeenAt,
    lastRetrievalType: retrievalType ?? state.lastRetrievalType,
  };
}

/** Mastery gate for reading concepts. Ear-gated verification still has the last word. */
export const DEFAULT_MASTERY_THRESHOLD = 0.95;

export function isMastered(state: BktState, threshold = DEFAULT_MASTERY_THRESHOLD): boolean {
  return state.pKnown >= threshold;
}

/* ------------------------------------------------------------------- bridge */

/** Days of stability attributed to even odds (P(known) = 0.5). */
export const BKT_STABILITY_SCALE = 1;
/** Exponent on the mastery odds. 1 keeps the map gentle and strictly monotone. */
export const BKT_STABILITY_EXPONENT = 1;
/** Observations needed for ~86% evidential confidence. */
export const BKT_CONFIDENCE_OBSERVATIONS = 5;

/**
 * Strictly monotone map from mastery to a stability-like number of days:
 *
 *   S(p) = scale · (p / (1 − p)) ^ exponent
 *
 * p = 0.5 → 1 day, p = 0.9 → 9 days, p = 0.99 → 99 days. Monotone by construction,
 * so ink depth reads the same for ḥifẓ and reading.
 */
export function stabilityFromPKnown(pKnown: number): number {
  const p = clampProbability(pKnown);
  const odds = p / (1 - p);
  return clamp(BKT_STABILITY_SCALE * Math.pow(odds, BKT_STABILITY_EXPONENT), 0.01, 36_500);
}

/** Inverse of `stabilityFromPKnown` (exact within the unclamped range). */
export function pKnownFromStability(stability: number): number {
  const odds = Math.pow(Math.max(stability, 0) / BKT_STABILITY_SCALE, 1 / BKT_STABILITY_EXPONENT);
  return clampProbability(odds / (1 + odds));
}

export interface BktBridgeOptions {
  /** Mean evidence weight of the observations behind this state (0..1). */
  readonly evidenceWeight?: number;
}

/**
 * Present a BKT concept state in the shared `MemoryState` shape.
 *
 * `difficulty` is a display-parity value derived from mastery, not an FSRS input;
 * `lapses` counts incorrect observations; `confidence` grows with the number of
 * observations and is capped by their evidence weight.
 */
export function bktToMemoryState(state: BktState, options: BktBridgeOptions = {}): MemoryState {
  const evidenceWeight = clamp01(options.evidenceWeight ?? 1);
  const observationConfidence = 1 - Math.exp(-state.observations / BKT_CONFIDENCE_OBSERVATIONS);
  return {
    unitId: state.conceptId,
    kind: "reading_concept",
    stability: stabilityFromPKnown(state.pKnown),
    difficulty: clamp(1 + 9 * (1 - state.pKnown), 1, 10),
    reps: state.observations,
    lapses: state.observations - state.correctObservations,
    lastReviewAt: state.lastSeenAt,
    lastRetrievalType: state.lastRetrievalType,
    confidence: clamp01(observationConfidence * evidenceWeight),
  };
}

function clampProbability(value: number): number {
  return clamp(value, PROBABILITY_EPSILON, 1 - PROBABILITY_EPSILON);
}
