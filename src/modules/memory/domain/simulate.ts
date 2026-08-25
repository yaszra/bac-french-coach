/**
 * Simulated-learner harness.
 *
 * Runs the policy + scheduler loop for N days against a synthetic learner so we can
 * see what the engine actually does before a real child ever meets it: how many
 * reviews a day it asks for, how often it lets a unit lapse, whether its schedule
 * oscillates, and — the evidence rule, made testable — whether guessing can ever
 * produce mastery.
 *
 * Everything is deterministic: the only randomness is a seeded `mulberry32`, passed
 * into the archetype as a function. The same seed always yields the same run.
 *
 * This is an engineering instrument, not a learner-facing feature: no simulated
 * result is ever written into a real learner's memory state.
 */

import { DEFAULT_SCHEDULING_POLICY, applyReview, emptyState, retrievability } from "./fsrs";
import { clamp01, mean, rate, type Rate } from "./numeric";
import {
  DEFAULT_TIER_POLICIES,
  planSession,
  type NewUnitCandidate,
  type RecentLapse,
  type RecommendedAction,
  type TierPolicy,
} from "./policy";
import { addDays, daysBetween } from "./time";
import {
  bodyUnitId,
  isSuccessGrade,
  transitionUnitId,
  unitKindOf,
  type Grade,
  type LearnerTier,
  type MemoryState,
  type RetrievalType,
  type SchedulingPolicy,
  type UnitId,
  type UnitKind,
} from "./types";

/* --------------------------------------------------------------------- prng */

/**
 * mulberry32 — a small, fast, deterministic 32-bit PRNG. Returns values in [0, 1).
 * Chosen because it is three lines, has no state beyond one integer, and is trivial
 * to reimplement in another language if we ever port the harness.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/* --------------------------------------------------------------- archetypes */

export const LEARNER_ARCHETYPES = [
  "guesser",
  "steady",
  "fast_forgetter",
  "returning_adult",
] as const;

export type LearnerArchetype = (typeof LEARNER_ARCHETYPES)[number];

export interface Exercise {
  readonly unitId: UnitId;
  readonly action: RecommendedAction;
  readonly retrievalType: RetrievalType;
}

export interface ArchetypeContext {
  readonly now: Date;
  readonly scheduling: SchedulingPolicy;
  readonly dayIndex: number;
}

export type ArchetypeModel = (
  state: MemoryState,
  exercise: Exercise,
  rand: () => number,
  context: ArchetypeContext,
) => Grade;

export interface ArchetypeSpec {
  /**
   * Exponent on modelled retrievability. 1 means the learner forgets exactly as the
   * scheduler believes; above 1 they forget faster; below 1, slower.
   */
  readonly recallExponent: number;
  /** Floor on recall probability (attention, partial cues). */
  readonly recallFloor: number;
  /** Probability the first exposure to a new unit sticks well enough to grade a pass. */
  readonly firstExposureSuccess: number;
  /** When set, recall probability ignores the state entirely (pure guessing). */
  readonly constantRecall: number | null;
  /** Best grade this learner can produce — a guesser never demonstrates fluency. */
  readonly bestGrade: Grade;
  /** Exponent relief per recorded rep: a returning adult re-consolidates quickly. */
  readonly relearningReliefPerRep: number;
  /** Lower bound on the exponent once relief is applied. */
  readonly minRecallExponent: number;
}

export const ARCHETYPE_SPECS: Readonly<Record<LearnerArchetype, ArchetypeSpec>> = {
  // Taps through without retrieving. Correctness is chance, never fluency.
  guesser: {
    recallExponent: 1,
    recallFloor: 0,
    firstExposureSuccess: 0.3,
    constantRecall: 0.25,
    bestGrade: "hard",
    relearningReliefPerRep: 0,
    minRecallExponent: 1,
  },
  // Calibrated: forgets roughly as the model predicts, works most days.
  steady: {
    recallExponent: 0.9,
    recallFloor: 0.02,
    firstExposureSuccess: 0.85,
    constantRecall: null,
    bestGrade: "easy",
    relearningReliefPerRep: 0,
    minRecallExponent: 0.9,
  },
  // Real memory decays faster than the schedule assumes: lapses accumulate.
  fast_forgetter: {
    recallExponent: 2.4,
    recallFloor: 0.02,
    firstExposureSuccess: 0.75,
    constantRecall: null,
    bestGrade: "good",
    relearningReliefPerRep: 0,
    minRecallExponent: 2.4,
  },
  // Rusty but experienced: weak at first, re-consolidates fast with each rep.
  returning_adult: {
    recallExponent: 1.6,
    recallFloor: 0.05,
    firstExposureSuccess: 0.9,
    constantRecall: null,
    bestGrade: "easy",
    relearningReliefPerRep: 0.05,
    minRecallExponent: 0.8,
  },
};

const GRADE_CEILING: Readonly<Record<Grade, number>> = { again: 0, hard: 1, good: 2, easy: 3 };
const GRADES_BY_RANK: readonly Grade[] = ["again", "hard", "good", "easy"];

function capGrade(grade: Grade, best: Grade): Grade {
  const capped = Math.min(GRADE_CEILING[grade], GRADE_CEILING[best]);
  return GRADES_BY_RANK[capped] ?? "again";
}

/** Build a pure `(state, exercise) → grade` model from a spec. */
export function archetypeModel(spec: ArchetypeSpec): ArchetypeModel {
  return (state, exercise, rand, context) => {
    let probability: number;
    if (spec.constantRecall !== null) {
      probability = clamp01(spec.constantRecall);
    } else if (exercise.action === "learn_new" || state.reps === 0) {
      probability = clamp01(spec.firstExposureSuccess);
    } else {
      const exponent = Math.max(
        spec.minRecallExponent,
        spec.recallExponent - spec.relearningReliefPerRep * state.reps,
      );
      const recall = retrievability(state, context.now, context.scheduling);
      probability = clamp01(spec.recallFloor + (1 - spec.recallFloor) * Math.pow(recall, exponent));
    }

    const draw = rand();
    if (draw > probability) return "again";
    // Margin: how comfortably the recall succeeded. Comfortable recall reads as fluency.
    const margin = probability <= 0 ? 0 : (probability - draw) / probability;
    const grade: Grade = margin < 0.25 ? "hard" : margin < 0.8 ? "good" : "easy";
    return capGrade(grade, spec.bestGrade);
  };
}

export const ARCHETYPES: Readonly<Record<LearnerArchetype, ArchetypeModel>> = {
  guesser: archetypeModel(ARCHETYPE_SPECS.guesser),
  steady: archetypeModel(ARCHETYPE_SPECS.steady),
  fast_forgetter: archetypeModel(ARCHETYPE_SPECS.fast_forgetter),
  returning_adult: archetypeModel(ARCHETYPE_SPECS.returning_adult),
};

/* ------------------------------------------------------------------ harness */

export interface SimulatedReview {
  readonly dayIndex: number;
  readonly at: Date;
  readonly unitId: UnitId;
  readonly action: RecommendedAction;
  readonly retrievalType: RetrievalType;
  readonly grade: Grade;
  readonly elapsedDays: number;
  readonly retrievabilityBefore: number;
  readonly intervalDays: number;
  readonly stabilityAfter: number;
  readonly lapsed: boolean;
}

export interface SimulationMetrics {
  readonly days: number;
  /** Every recorded observation, including first exposures. */
  readonly totalObservations: number;
  /** Observations of already-learned units (the denominator for retention). */
  readonly totalReviews: number;
  readonly totalLapses: number;
  readonly unitsIntroduced: number;
  readonly reviewsPerDay: number | null;
  readonly reviewsPerDayByDay: readonly number[];
  readonly lapses: Rate;
  readonly lapsesPer100Reviews: number | null;
  /** Success rate of reviews whose interval had reached 7 (resp. 30) days. */
  readonly retentionAt7: Rate;
  readonly retentionAt30: Rate;
  /** Share of consecutive intervals per unit that did not shrink. */
  readonly scheduleStability: Rate;
  readonly meanStability: number | null;
  readonly maxStability: number | null;
  readonly meanConfidence: number | null;
}

export interface SimulationOptions {
  readonly archetype: LearnerArchetype;
  readonly days: number;
  readonly seed: number;
  readonly startAt: Date;
  readonly tier?: LearnerTier;
  readonly newCandidates?: readonly NewUnitCandidate[];
  readonly unitCount?: number;
  readonly scheduling?: SchedulingPolicy;
  readonly tierPolicy?: TierPolicy;
  readonly maxItemsPerDay?: number;
  readonly model?: ArchetypeModel;
}

export interface SimulationResult {
  readonly archetype: LearnerArchetype;
  readonly seed: number;
  readonly days: number;
  readonly metrics: SimulationMetrics;
  readonly events: readonly SimulatedReview[];
  readonly finalStates: readonly MemoryState[];
}

/**
 * A synthetic curriculum of ḥifẓ units: āyah bodies interleaved with the transitions
 * that join them. Ids only — structure, never scripture.
 */
export function syntheticCurriculum(unitCount: number, surah = 2): readonly NewUnitCandidate[] {
  const candidates: NewUnitCandidate[] = [];
  for (let index = 1; candidates.length < unitCount; index += 1) {
    candidates.push({
      unitId: bodyUnitId({ surah, ayah: index }),
      kind: "ayah_body",
      order: candidates.length,
    });
    if (candidates.length >= unitCount) break;
    candidates.push({
      unitId: transitionUnitId({ surah, ayah: index }, { surah, ayah: index + 1 }),
      kind: "ayah_transition",
      order: candidates.length,
    });
  }
  return candidates;
}

/** Run the policy + scheduler loop for `days` days and report what happened. */
export function simulate(options: SimulationOptions): SimulationResult {
  const scheduling = options.scheduling ?? DEFAULT_SCHEDULING_POLICY;
  const tier: LearnerTier = options.tier ?? "adult";
  const tierPolicy = options.tierPolicy ?? DEFAULT_TIER_POLICIES[tier];
  const model = options.model ?? ARCHETYPES[options.archetype];
  const rand = mulberry32(options.seed);
  const candidates = options.newCandidates ?? syntheticCurriculum(options.unitCount ?? 20);
  const maxItemsPerDay = options.maxItemsPerDay ?? 60;

  const kinds = new Map<UnitId, UnitKind>(
    candidates.map((candidate) => [candidate.unitId, candidate.kind]),
  );
  const states = new Map<UnitId, MemoryState>();
  // Only failures inside the repair window matter to the policy; older ones are
  // dropped so a long run does not carry a growing tail of dead evidence.
  let lapses: readonly RecentLapse[] = [];
  const events: SimulatedReview[] = [];
  const reviewsPerDayByDay: number[] = [];

  for (let dayIndex = 0; dayIndex < options.days; dayIndex += 1) {
    const now = addDays(options.startAt, dayIndex);
    const plan = planSession({
      now,
      tier,
      tierPolicy,
      scheduling,
      states: [...states.values()],
      recentLapses: lapses,
      newCandidates: candidates,
    });

    let performed = 0;
    for (const item of plan.selected.slice(0, maxItemsPerDay)) {
      const kind = kinds.get(item.unitId) ?? unitKindOf(item.unitId) ?? "ayah_body";
      const state = states.get(item.unitId) ?? emptyState(item.unitId, kind);
      const exercise: Exercise = {
        unitId: item.unitId,
        action: item.action,
        retrievalType: item.retrievalType,
      };
      const grade = model(state, exercise, rand, { now, scheduling, dayIndex });
      const outcome = applyReview(
        state,
        { grade, retrievalType: item.retrievalType, at: now },
        scheduling,
      );
      states.set(item.unitId, outcome.next);
      if (outcome.lapsed) {
        lapses = [
          ...lapses.filter(
            (lapse) =>
              daysBetween(lapse.occurredAt, now) <= tierPolicy.repairWindowDays &&
              lapse.unitId !== item.unitId,
          ),
          { unitId: item.unitId, occurredAt: now },
        ];
      }
      events.push({
        dayIndex,
        at: now,
        unitId: item.unitId,
        action: item.action,
        retrievalType: item.retrievalType,
        grade,
        elapsedDays: outcome.elapsedDays,
        retrievabilityBefore: outcome.retrievabilityBefore,
        intervalDays: outcome.intervalDays,
        stabilityAfter: outcome.next.stability,
        lapsed: outcome.lapsed,
      });
      performed += 1;
    }
    reviewsPerDayByDay.push(performed);
  }

  return {
    archetype: options.archetype,
    seed: options.seed,
    days: options.days,
    metrics: metricsOf(events, [...states.values()], options.days, reviewsPerDayByDay),
    events,
    finalStates: [...states.values()],
  };
}

function metricsOf(
  events: readonly SimulatedReview[],
  finalStates: readonly MemoryState[],
  days: number,
  reviewsPerDayByDay: readonly number[],
): SimulationMetrics {
  const reviews = events.filter((event) => event.action !== "learn_new");
  const lapseCount = events.filter((event) => event.lapsed).length;

  const retentionAt = (minimumElapsedDays: number): Rate => {
    const window = reviews.filter((event) => event.elapsedDays >= minimumElapsedDays);
    const successes = window.filter((event) => isSuccessGrade(event.grade)).length;
    return rate(successes, window.length);
  };

  // Schedule stability: per unit, how often the next interval did not shrink.
  const intervalsByUnit = new Map<UnitId, number[]>();
  for (const event of reviews) {
    const list = intervalsByUnit.get(event.unitId);
    if (list === undefined) intervalsByUnit.set(event.unitId, [event.intervalDays]);
    else list.push(event.intervalDays);
  }
  let pairs = 0;
  let nonShrinking = 0;
  for (const intervals of intervalsByUnit.values()) {
    for (let index = 1; index < intervals.length; index += 1) {
      const previous = intervals[index - 1];
      const current = intervals[index];
      if (previous === undefined || current === undefined) continue;
      pairs += 1;
      if (current >= previous) nonShrinking += 1;
    }
  }

  const stabilities = finalStates.map((state) => state.stability);
  const confidences = finalStates.map((state) => state.confidence);

  return {
    days,
    totalObservations: events.length,
    totalReviews: reviews.length,
    totalLapses: lapseCount,
    unitsIntroduced: finalStates.length,
    reviewsPerDay: days <= 0 ? null : events.length / days,
    reviewsPerDayByDay,
    lapses: rate(lapseCount, reviews.length),
    lapsesPer100Reviews: reviews.length === 0 ? null : (lapseCount / reviews.length) * 100,
    retentionAt7: retentionAt(7),
    retentionAt30: retentionAt(30),
    scheduleStability: rate(nonShrinking, pairs),
    meanStability: mean(stabilities),
    maxStability: stabilities.length === 0 ? null : Math.max(...stabilities),
    meanConfidence: mean(confidences),
  };
}
