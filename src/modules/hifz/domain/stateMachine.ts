/**
 * The per-unit ḥifẓ state machine.
 *
 *   not_started → listening → building → recalling → awaiting_verification
 *                                                  → verified ⇄ maintaining
 *                                                  ↘ lapsed ↗
 *
 * The one invariant that matters: **`verified` is reachable only through a
 * `human_verdict` event**. There is no arrangement of exercise outcomes, however
 * long or however good, that reaches it — `exercise_completed` can raise a unit to
 * `recalling` and can open `awaiting_verification`, and that is the end of what a
 * machine may conclude. A property test drives this machine with a seeded PRNG over
 * random evidence and asserts `verified` is never reached.
 *
 * `transition` is total: an event that does not apply to the current state returns
 * that state unchanged. It never throws, so a replay of an append-only event log can
 * never fail on an out-of-order event.
 *
 * Pure: no clock (every event carries its own server-stamped time), no I/O.
 */

import type { UnitId } from "@/modules/memory/domain/types";
import { exerciseRank, type HifzExercise } from "./exercises";
import type { GradeResult } from "./grading";

/* -------------------------------------------------------------------- states */

export const HIFZ_UNIT_STATES = [
  "not_started",
  "listening",
  "building",
  "recalling",
  "awaiting_verification",
  "verified",
  "lapsed",
  "maintaining",
] as const;

export type HifzUnitState = (typeof HIFZ_UNIT_STATES)[number];

/** The learning phases, in order. Ranks only apply to the pre-verification path. */
const LEARNING_PHASES = ["not_started", "listening", "building", "recalling"] as const;
type LearningPhase = (typeof LEARNING_PHASES)[number];

function phaseRank(state: HifzUnitState): number {
  return (LEARNING_PHASES as readonly string[]).indexOf(state);
}

function phaseAt(rank: number): LearningPhase {
  const bounded = Math.min(Math.max(rank, 0), LEARNING_PHASES.length - 1);
  return LEARNING_PHASES[bounded] ?? "not_started";
}

/**
 * The phase an exercise exercises: listening is exposure; ordering and gap work is
 * building; cueing and chaining is recall. The ear is not a phase — it is the gate.
 */
export const EXERCISE_PHASE: Readonly<Record<HifzExercise, LearningPhase | "awaiting_verification">> =
  {
    listen: "listening",
    recall_first: "building",
    rebuild: "building",
    gap_fill: "building",
    next_ayah_cue: "recalling",
    connect_chain: "recalling",
    oral_recitation: "awaiting_verification",
  };

/* ------------------------------------------------------------------ verdicts */

export const VERDICT_OUTCOMES = ["verified", "needs_work", "not_heard"] as const;
export type VerdictOutcome = (typeof VERDICT_OUTCOMES)[number];

/**
 * A person listened. This is the only evidence that can verify a unit, and it can
 * never be synthesised: `verifiedBy` is the opaque id of the human who listened.
 */
export interface HumanVerdict {
  readonly unitId: UnitId;
  readonly outcome: VerdictOutcome;
  readonly at: Date;
  /** Opaque id of the person who listened. Never a model, never a client. */
  readonly verifiedBy: string;
}

/* -------------------------------------------------------------------- events */

export type HifzEvent =
  | {
      readonly type: "exercise_completed";
      readonly exercise: HifzExercise;
      readonly result: GradeResult;
      readonly at: Date;
    }
  | { readonly type: "verification_requested"; readonly at: Date }
  | { readonly type: "verification_withdrawn"; readonly at: Date }
  | { readonly type: "human_verdict"; readonly verdict: HumanVerdict }
  | {
      readonly type: "scheduler_tick";
      readonly at: Date;
      /** The scheduler says this unit has reached its review date. */
      readonly due: boolean;
      /** The scheduler recorded a lapse: something known was forgotten. */
      readonly lapsed: boolean;
    };

/** States from which asking for the ear makes sense. */
const REQUESTABLE_STATES: readonly HifzUnitState[] = [
  "building",
  "recalling",
  "lapsed",
  "maintaining",
  "verified",
];

/** States that hold something a lapse can take away. */
const LAPSABLE_STATES: readonly HifzUnitState[] = [
  "building",
  "recalling",
  "awaiting_verification",
  "verified",
  "maintaining",
];

/* ---------------------------------------------------------------- transition */

/** The state a unit starts in: nothing recorded, nothing claimed. */
export function initialUnitState(): HifzUnitState {
  return "not_started";
}

/**
 * Apply one event. Total, pure and idempotent for events that do not apply.
 *
 * `verified` appears in exactly one branch below — the `human_verdict` branch.
 */
export function transition(state: HifzUnitState, event: HifzEvent): HifzUnitState {
  switch (event.type) {
    case "human_verdict":
      return applyVerdict(state, event.verdict);
    case "exercise_completed":
      return applyExercise(state, event.exercise, event.result);
    case "verification_requested":
      return REQUESTABLE_STATES.includes(state) ? "awaiting_verification" : state;
    case "verification_withdrawn":
      return state === "awaiting_verification" ? "recalling" : state;
    case "scheduler_tick":
      if (event.lapsed) return LAPSABLE_STATES.includes(state) ? "lapsed" : state;
      if (event.due && state === "verified") return "maintaining";
      return state;
  }
}

/**
 * The only door to `verified`.
 *
 * A verdict is accepted from any state, including `not_started`: a teacher who sits
 * with a child and listens has produced the strongest evidence this system knows,
 * whether or not the app happened to record the practice that led to it.
 */
function applyVerdict(state: HifzUnitState, verdict: HumanVerdict): HifzUnitState {
  switch (verdict.outcome) {
    case "verified":
      return "verified";
    case "needs_work":
      // Heard, and not right yet: back to producing it.
      return state === "not_started" || state === "listening" || state === "building" || state === "lapsed"
        ? state
        : "recalling";
    case "not_heard":
      // Nothing was assessed — the request stands, the state does not move.
      return state;
  }
}

function applyExercise(
  state: HifzUnitState,
  exercise: HifzExercise,
  result: GradeResult,
): HifzUnitState {
  // Unusable observations prove nothing, so they move nothing.
  if (result.kind === "insufficient_evidence") return state;

  // A submitted recitation is a request for the ear, never a verification.
  if (result.kind === "requires_human") {
    return REQUESTABLE_STATES.includes(state) || state === "awaiting_verification"
      ? "awaiting_verification"
      : state;
  }

  const failed = result.grade === "again";

  if (state === "verified" || state === "maintaining") {
    return failed ? "lapsed" : "maintaining";
  }
  if (state === "awaiting_verification") {
    // A failure while the teacher is queued withdraws the request: their time is
    // not spent on something the learner has just shown they cannot hold.
    return failed ? "recalling" : "awaiting_verification";
  }

  const target = EXERCISE_PHASE[exercise];
  const targetRank = target === "awaiting_verification" ? phaseRank("recalling") : phaseRank(target);

  if (state === "lapsed") {
    // Repair: a pass lifts the unit back onto the ladder, never past the ear.
    if (failed) return "lapsed";
    return result.grade === "hard" ? "lapsed" : phaseAt(Math.max(phaseRank("building"), targetRank));
  }

  const currentRank = phaseRank(state);
  if (failed) return phaseAt(Math.max(1, currentRank - 1));
  if (result.grade === "hard") return phaseAt(Math.max(1, currentRank));
  return phaseAt(Math.max(currentRank, targetRank));
}

/** Fold a whole history. Useful for replaying an append-only event log. */
export function runMachine(
  initial: HifzUnitState,
  events: readonly HifzEvent[],
): HifzUnitState {
  let state = initial;
  for (const event of events) state = transition(state, event);
  return state;
}

export function isVerified(state: HifzUnitState): boolean {
  return state === "verified";
}

/* ------------------------------------------------------- verification gating */

export interface VerificationPolicy {
  /** Passing machine attempts required before a teacher's time is asked for. */
  readonly minPasses: number;
  /** Strongest single attempt required, on the ladder's 0..1 scale. */
  readonly minEvidenceStrength: number;
}

/**
 * Two passes and one attempt at cue strength or better.
 *
 * The bar exists to protect the teacher's queue, not the learner: it is deliberately
 * low enough that a learner who can produce the āyah from a cue twice gets heard.
 */
export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
  minPasses: 2,
  minEvidenceStrength: 0.5,
};

export interface VerificationEvidenceSummary {
  readonly passes: number;
  readonly attempts: number;
  readonly strongestExercise: HifzExercise | null;
  readonly strongestEvidence: number;
}

export type VerificationEligibility =
  | { readonly allowed: true; readonly evidence: VerificationEvidenceSummary }
  | {
      readonly allowed: false;
      /** Stable i18n keys naming what is not yet true. */
      readonly missing: readonly string[];
      readonly evidence: VerificationEvidenceSummary;
    };

/** Summarise what the machine has actually observed, with its denominators. */
export function summariseVerificationEvidence(
  history: readonly HifzEvent[],
): VerificationEvidenceSummary {
  let passes = 0;
  let attempts = 0;
  let strongestEvidence = 0;
  let strongestExercise: HifzExercise | null = null;
  for (const event of history) {
    if (event.type !== "exercise_completed") continue;
    if (event.result.kind !== "graded") continue;
    attempts += 1;
    if (event.result.grade === "again") continue;
    passes += 1;
    const strength = event.result.evidenceStrength;
    const better =
      strongestExercise === null ||
      strength > strongestEvidence ||
      // Same strength, higher rung: the harder retrieval is the better evidence.
      (strength === strongestEvidence &&
        exerciseRank(event.exercise) > exerciseRank(strongestExercise));
    if (better) {
      strongestEvidence = strength;
      strongestExercise = event.exercise;
    }
  }
  return { passes, attempts, strongestExercise, strongestEvidence };
}

/**
 * May this unit be put in front of a person right now?
 *
 * This is a queue-protection gate, not a mastery gate: failing it never means the
 * learner is not ready, only that the machine has not yet seen enough to spend a
 * teacher's minutes. A teacher may always record a verdict directly.
 */
export function canRequestVerification(
  state: HifzUnitState,
  history: readonly HifzEvent[],
  policy: VerificationPolicy = DEFAULT_VERIFICATION_POLICY,
): VerificationEligibility {
  const evidence = summariseVerificationEvidence(history);
  const missing: string[] = [];
  if (state === "awaiting_verification") missing.push("hifz.verification.already_awaiting");
  else if (!REQUESTABLE_STATES.includes(state)) missing.push("hifz.verification.state");
  if (evidence.passes < policy.minPasses) missing.push("hifz.verification.passes");
  if (evidence.strongestEvidence < policy.minEvidenceStrength) {
    missing.push("hifz.verification.evidence_strength");
  }
  return missing.length === 0 ? { allowed: true, evidence } : { allowed: false, missing, evidence };
}
