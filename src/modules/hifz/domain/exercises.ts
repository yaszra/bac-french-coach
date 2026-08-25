/**
 * The ḥifẓ exercise ladder.
 *
 * Seven rungs, ordered by *how much a success on that rung actually proves*:
 *
 *   listen → recall_first → rebuild → gap_fill → next_ayah_cue → connect_chain
 *          → oral_recitation
 *
 * The order is an evidence order, not a difficulty order. Listening proves almost
 * nothing (the learner was present); rebuilding proves ordering with every word in
 * front of them; a gap fill makes them produce words that are not on screen; a cue
 * makes them start a new āyah from its neighbour; a chain makes them hold several
 * joins at once; and the top rung is a human listening — the only rung this engine
 * cannot grade (see `grading.ts`).
 *
 * Every rung name is also a `RetrievalType` in the memory engine, so a ladder rung
 * can be handed straight to the scheduler without translation.
 *
 * Pure: no clock, no I/O, no randomness. Nothing here writes memory state.
 */

import { retrievability, DEFAULT_SCHEDULING_POLICY } from "@/modules/memory/domain/fsrs";
import { clamp01 } from "@/modules/memory/domain/numeric";
import { hasEvidence } from "@/modules/memory/domain/types";
import type {
  Grade,
  MemoryState,
  RetrievalType,
  SchedulingPolicy,
} from "@/modules/memory/domain/types";

/* -------------------------------------------------------------------- ladder */

/** The rungs, weakest evidence first. Index in this array is the rung's rank. */
export const EXERCISE_LADDER = [
  "listen",
  "recall_first",
  "rebuild",
  "gap_fill",
  "next_ayah_cue",
  "connect_chain",
  "oral_recitation",
] as const;

export type HifzExercise = (typeof EXERCISE_LADDER)[number];

/** Compile-time proof that every rung is a memory-engine `RetrievalType`. */
export type ExerciseIsRetrievalType = HifzExercise extends RetrievalType ? true : never;
const _exerciseIsRetrievalType: ExerciseIsRetrievalType = true;
void _exerciseIsRetrievalType;

/** The retrieval type the scheduler should record for this rung (identity mapping). */
export function retrievalTypeOf(exercise: HifzExercise): RetrievalType {
  return exercise;
}

export const FIRST_RUNG: HifzExercise = "listen";
export const LAST_RUNG: HifzExercise = "oral_recitation";

export function isHifzExercise(value: string): value is HifzExercise {
  return (EXERCISE_LADDER as readonly string[]).includes(value);
}

/** 0 for `listen` … 6 for `oral_recitation`. `-1` is impossible for a valid rung. */
export function exerciseRank(exercise: HifzExercise): number {
  return EXERCISE_LADDER.indexOf(exercise);
}

/* ------------------------------------------------------------------ strength */

/**
 * How much a clean success on each rung proves, in [0, 1].
 *
 * Anchored by the brief: passive listening sits just above zero, an unassisted oral
 * recitation is 1. The values rise strictly along the ladder, so
 * `evidenceStrength` and `exerciseRank` can never disagree.
 *
 * These are *ladder* strengths — what the exercise can prove. They are deliberately
 * not the memory engine's `evidenceWeights` (which rank `rebuild` above `gap_fill`,
 * because they measure how much a single observation should move scheduler
 * confidence). Where the two differ, the ladder is the pedagogic order: rebuilding
 * happens with every word visible, filling a gap does not.
 */
export const EXERCISE_EVIDENCE_STRENGTH: Readonly<Record<HifzExercise, number>> = {
  listen: 0.05,
  recall_first: 0.3,
  rebuild: 0.45,
  gap_fill: 0.6,
  next_ayah_cue: 0.75,
  connect_chain: 0.9,
  oral_recitation: 1,
};

/** Evidence strength of a clean success on this rung, in [0, 1]. */
export function evidenceStrength(exercise: HifzExercise): number {
  return EXERCISE_EVIDENCE_STRENGTH[exercise];
}

/** True when this engine may grade the rung at all. The ear-gate is never machine-graded. */
export function isMachineGradable(exercise: HifzExercise): boolean {
  return exercise !== "oral_recitation";
}

/* ------------------------------------------------------------------ movement */

/**
 * What the last attempt on a rung produced. This mirrors `GradeResult` structurally
 * (a `GradeResult` can be passed straight in) without importing it, so the ladder
 * stays independent of the grader.
 */
export type ExerciseOutcome =
  | { readonly kind: "graded"; readonly grade: Grade }
  | { readonly kind: "requires_human" }
  | { readonly kind: "insufficient_evidence" };

function rungAt(index: number): HifzExercise {
  const bounded = Math.min(Math.max(index, 0), EXERCISE_LADDER.length - 1);
  const rung = EXERCISE_LADDER[bounded];
  // Defensive: the clamp above makes this unreachable; noUncheckedIndexedAccess
  // still requires the fallback, and the fallback is the safest rung.
  return rung ?? FIRST_RUNG;
}

/**
 * The rung to offer next.
 *
 * - `again` steps down one rung — a learner who cannot do this is not asked for more.
 * - `hard` repeats the same rung.
 * - `good` steps up one rung.
 * - `easy` steps up two, but never *skips* `connect_chain`: holding several joins is
 *   the last thing the machine can observe before a person listens.
 * - `requires_human` and `insufficient_evidence` never move the ladder. Nothing was
 *   proved, so nothing changes.
 */
export function nextExercise(current: HifzExercise, outcome: ExerciseOutcome): HifzExercise {
  if (outcome.kind !== "graded") return current;
  const index = exerciseRank(current);
  switch (outcome.grade) {
    case "again":
      return rungAt(index - 1);
    case "hard":
      return current;
    case "good":
      return rungAt(index + 1);
    case "easy": {
      const chain = exerciseRank("connect_chain");
      const target = index + 2;
      // Never leap over the chain into the ear.
      return rungAt(index < chain && target > chain ? chain : target);
    }
  }
}

/* ------------------------------------------------------------------- allowed */

export interface LadderContext {
  /**
   * The moment the rungs are being chosen for. Omit it and the ladder ignores
   * forgetting entirely and judges on recorded stability and confidence alone —
   * the conservative reading, never a flattering one.
   */
  readonly now?: Date;
  readonly scheduling?: SchedulingPolicy;
  readonly config?: LadderConfig;
}

export interface LadderConfig {
  /** Stability, in days, mapping to a normalised strength of 0.5. */
  readonly stabilityHalfPointDays: number;
  /** Minimum ladder strength required to unlock each rung above `listen`. */
  readonly thresholds: Readonly<Record<Exclude<HifzExercise, "listen">, number>>;
}

export const DEFAULT_LADDER_CONFIG: LadderConfig = {
  stabilityHalfPointDays: 21,
  thresholds: {
    // Any recorded evidence at all unlocks a first-word recall.
    recall_first: 0,
    rebuild: 0.15,
    gap_fill: 0.3,
    next_ayah_cue: 0.45,
    connect_chain: 0.6,
    // A learner who can connect from blank is ready for a person to listen.
    oral_recitation: 0.6,
  },
};

/**
 * Ladder strength in [0, 1]: half from recorded stability, half from present
 * retrievability, scaled by how much evidence backs the state.
 *
 * A unit with nothing recorded is 0 — we never ask a learner to produce from a blank
 * we have no evidence they can fill.
 */
export function ladderStrength(state: MemoryState, context: LadderContext = {}): number {
  if (!hasEvidence(state)) return 0;
  const config = context.config ?? DEFAULT_LADDER_CONFIG;
  const scheduling = context.scheduling ?? DEFAULT_SCHEDULING_POLICY;
  const stability = Math.max(state.stability, 0);
  const half = Math.max(config.stabilityHalfPointDays, 0.01);
  const normalisedStability = stability / (stability + half);
  const recall =
    context.now === undefined ? normalisedStability : retrievability(state, context.now, scheduling);
  return clamp01(0.5 * (normalisedStability + recall) * clamp01(state.confidence + 0.5));
}

/**
 * The rungs that make sense right now: always a contiguous prefix from `listen` up
 * to the highest rung the evidence supports.
 *
 * A learner who cannot yet rebuild is never asked to connect from blank; a learner
 * with nothing recorded is only offered the recitation to listen to.
 *
 * This is what to *offer*. It is not a gate on human verification — a teacher may
 * ask for the ear at any time (see `canRequestVerification`).
 */
export function allowedExercises(
  state: MemoryState,
  context: LadderContext = {},
): readonly HifzExercise[] {
  const config = context.config ?? DEFAULT_LADDER_CONFIG;
  const strength = ladderStrength(state, context);
  const allowed: HifzExercise[] = [FIRST_RUNG];
  if (!hasEvidence(state)) return allowed;
  for (const rung of EXERCISE_LADDER) {
    if (rung === "listen") continue;
    if (strength < config.thresholds[rung]) break;
    allowed.push(rung);
  }
  return allowed;
}

/** The strongest rung currently worth offering. Always at least `listen`. */
export function highestAllowedExercise(
  state: MemoryState,
  context: LadderContext = {},
): HifzExercise {
  const allowed = allowedExercises(state, context);
  return allowed[allowed.length - 1] ?? FIRST_RUNG;
}

/** True when the rung is on the learner's current ladder. */
export function isExerciseAllowed(
  exercise: HifzExercise,
  state: MemoryState,
  context: LadderContext = {},
): boolean {
  return allowedExercises(state, context).includes(exercise);
}
