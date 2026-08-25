/**
 * Turn ranked recommendations into a session a learner can actually sit through.
 *
 * The memory engine's policy decides *what is worth doing* and in what order. This
 * module decides *what fits*: it maps each recommendation onto a rung of the ḥifẓ
 * ladder, costs it in minutes, and fills the tier's budget from the top down.
 *
 * Three rules it will not break:
 *
 * 1. **The kids' ceiling.** A session for a 4–8 year old is never longer than ten
 *    minutes, whatever budget is passed in. The ceiling clamps the budget; it is not
 *    a suggestion.
 * 2. **One obvious first action.** A plan always names its first step. The premium
 *    rule says one obvious next action per screen; the type makes it impossible to
 *    render a plan without one.
 * 3. **An empty plan is a real plan.** When nothing is due, the answer is an empty
 *    plan with a reason — never invented busywork to fill a streak.
 *
 * Pure: no clock, no I/O, no randomness. Nothing here writes memory state.
 */

import { clamp } from "@/modules/memory/domain/numeric";
import type { Recommendation, RecommendedAction } from "@/modules/memory/domain/policy";
import type { LearnerTier, MemoryState, Reason, UnitId } from "@/modules/memory/domain/types";
import {
  highestAllowedExercise,
  exerciseRank,
  isHifzExercise,
  EXERCISE_LADDER,
  type HifzExercise,
  type LadderContext,
} from "./exercises";

/** Hard ceiling for the youngest learners. Ten minutes, and not a minute more. */
export const KIDS_SESSION_CEILING_MINUTES = 10;

/** Ceilings per tier. A budget above the ceiling is clamped down to it. */
export const SESSION_CEILING_MINUTES: Readonly<Record<LearnerTier, number>> = {
  kids: KIDS_SESSION_CEILING_MINUTES,
  teen: 30,
  adult: 60,
};

/** Ceiling applied when the tier is unknown: nobody gets an unbounded session. */
export const DEFAULT_SESSION_CEILING_MINUTES = 60;

/** What each rung costs when nothing better is known, in minutes. */
export const DEFAULT_EXERCISE_MINUTES: Readonly<Record<HifzExercise, number>> = {
  listen: 1,
  recall_first: 1,
  rebuild: 1.5,
  gap_fill: 1.5,
  next_ayah_cue: 1,
  connect_chain: 2,
  oral_recitation: 3,
};

/** The rung each recommended action runs on. */
export const ACTION_EXERCISE: Readonly<Record<RecommendedAction, HifzExercise>> = {
  verify_with_teacher: "oral_recitation",
  repair_drill: "rebuild",
  review: "recall_first",
  strengthen_join: "connect_chain",
  learn_new: "listen",
  maintenance_reading: "oral_recitation",
};

/** Actions settled by a person's ear. Their rung is never clamped down. */
const HUMAN_ACTIONS: readonly RecommendedAction[] = ["verify_with_teacher", "maintenance_reading"];

export interface PlannedStep {
  /** 1-based position in the session. */
  readonly order: number;
  readonly unitId: UnitId;
  readonly action: RecommendedAction;
  readonly exercise: HifzExercise;
  readonly estimatedMinutes: number;
  /** The policy's machine-readable "why this?", carried through unchanged. */
  readonly reason: Reason;
  readonly priority: number;
  readonly isFirstAction: boolean;
}

export type WithheldReason =
  | "hifz.plan.budget_spent"
  | "hifz.plan.new_capped"
  | "hifz.plan.unknown_action";

export interface WithheldItem {
  readonly unitId: UnitId;
  readonly action: RecommendedAction;
  readonly estimatedMinutes: number;
  readonly reason: WithheldReason;
}

export type HifzSessionPlan =
  | {
      readonly kind: "plan";
      readonly steps: readonly PlannedStep[];
      /** The one obvious next action. Always present in a plan. */
      readonly firstAction: PlannedStep;
      readonly totalEstimatedMinutes: number;
      /** The budget actually used, after ceilings. */
      readonly budgetMinutes: number;
      /** What the caller asked for, before ceilings — so the clamp is visible. */
      readonly requestedBudgetMinutes: number;
      readonly newUnitsIncluded: number;
      readonly withheld: readonly WithheldItem[];
    }
  | {
      readonly kind: "empty";
      /** Stable i18n key: why there is nothing to do. */
      readonly reason: "hifz.plan.nothing_due" | "hifz.plan.budget_too_small";
      readonly budgetMinutes: number;
      readonly requestedBudgetMinutes: number;
      readonly withheld: readonly WithheldItem[];
    };

export interface SessionPlanInput {
  /** Ranked recommendations, usually straight from the memory engine's policy. */
  readonly recommendations: readonly Recommendation[];
  readonly tierBudgetMinutes: number;
  /** A flat per-exercise cost, or a per-rung table. Falls back to the policy's own. */
  readonly estimatedMinutesPerExercise?: number | Readonly<Partial<Record<HifzExercise, number>>>;
  readonly maxNewUnits: number;
  /** Applies the tier's ceiling. Omit and a 60-minute ceiling still applies. */
  readonly tier?: LearnerTier;
  /**
   * Current memory states. When a unit's state is known, a machine-graded rung is
   * clamped to the highest rung the learner's evidence supports — nobody is asked to
   * connect from blank on a unit they cannot yet rebuild.
   */
  readonly states?: readonly MemoryState[];
  readonly now?: Date;
}

function ceilingFor(tier: LearnerTier | undefined): number {
  return tier === undefined ? DEFAULT_SESSION_CEILING_MINUTES : SESSION_CEILING_MINUTES[tier];
}

function costOf(
  exercise: HifzExercise,
  recommendation: Recommendation,
  override: SessionPlanInput["estimatedMinutesPerExercise"],
): number {
  const candidates: readonly (number | undefined)[] =
    typeof override === "number"
      ? [override]
      : override === undefined
        ? [recommendation.estimatedMinutes]
        : [override[exercise], recommendation.estimatedMinutes];
  for (const candidate of candidates) {
    if (candidate !== undefined && Number.isFinite(candidate) && candidate > 0) return candidate;
  }
  return DEFAULT_EXERCISE_MINUTES[exercise];
}

/**
 * Choose the rung for a step.
 *
 * The action proposes; the learner's evidence disposes. Human-settled actions keep
 * their rung — a teacher may always listen.
 */
export function exerciseForStep(
  recommendation: Recommendation,
  state: MemoryState | undefined,
  context: LadderContext,
): HifzExercise {
  const proposed = isHifzExercise(recommendation.retrievalType)
    ? recommendation.retrievalType
    : ACTION_EXERCISE[recommendation.action];
  if (HUMAN_ACTIONS.includes(recommendation.action)) return proposed;
  if (state === undefined) return proposed;
  const highest = highestAllowedExercise(state, context);
  return exerciseRank(proposed) <= exerciseRank(highest) ? proposed : highest;
}

/**
 * Build the session.
 *
 * Recommendations are taken in priority order; each one that fits the remaining
 * budget becomes a step. New material is withheld once its cap is reached or the
 * budget is spent — new āyāt are the first thing to go, never the reviews that hold
 * what the learner already has.
 */
export function planSession(input: SessionPlanInput): HifzSessionPlan {
  const requested = Number.isFinite(input.tierBudgetMinutes) ? input.tierBudgetMinutes : 0;
  const budget = clamp(Math.min(requested, ceilingFor(input.tier)), 0, ceilingFor(input.tier));
  const ladderContext: LadderContext = input.now === undefined ? {} : { now: input.now };
  const states = new Map<UnitId, MemoryState>();
  for (const state of input.states ?? []) states.set(state.unitId, state);

  const ordered = [...input.recommendations].sort(
    (left, right) =>
      right.priority - left.priority ||
      (left.unitId < right.unitId ? -1 : left.unitId > right.unitId ? 1 : 0),
  );

  const steps: PlannedStep[] = [];
  const withheld: WithheldItem[] = [];
  const maxNew = Number.isFinite(input.maxNewUnits) ? Math.max(0, input.maxNewUnits) : 0;
  let spent = 0;
  let newUnitsIncluded = 0;

  for (const recommendation of ordered) {
    const exercise = exerciseForStep(
      recommendation,
      states.get(recommendation.unitId),
      ladderContext,
    );
    const cost = costOf(exercise, recommendation, input.estimatedMinutesPerExercise);

    if (recommendation.action === "learn_new" && newUnitsIncluded >= maxNew) {
      withheld.push({
        unitId: recommendation.unitId,
        action: recommendation.action,
        estimatedMinutes: cost,
        reason: "hifz.plan.new_capped",
      });
      continue;
    }
    if (spent + cost > budget) {
      withheld.push({
        unitId: recommendation.unitId,
        action: recommendation.action,
        estimatedMinutes: cost,
        reason: "hifz.plan.budget_spent",
      });
      continue;
    }

    spent += cost;
    if (recommendation.action === "learn_new") newUnitsIncluded += 1;
    steps.push({
      order: steps.length + 1,
      unitId: recommendation.unitId,
      action: recommendation.action,
      exercise,
      estimatedMinutes: cost,
      reason: recommendation.reason,
      priority: recommendation.priority,
      isFirstAction: steps.length === 0,
    });
  }

  const firstAction = steps[0];
  if (firstAction === undefined) {
    return {
      kind: "empty",
      // "Nothing due" and "nothing fits" are different truths, and are told apart.
      reason:
        input.recommendations.length === 0
          ? "hifz.plan.nothing_due"
          : "hifz.plan.budget_too_small",
      budgetMinutes: budget,
      requestedBudgetMinutes: requested,
      withheld,
    };
  }

  return {
    kind: "plan",
    steps,
    firstAction,
    totalEstimatedMinutes: Math.round(spent * 100) / 100,
    budgetMinutes: budget,
    requestedBudgetMinutes: requested,
    newUnitsIncluded,
    withheld,
  };
}

/** The ladder rungs a plan touches, weakest first. Useful for preloading audio. */
export function exercisesInPlan(plan: HifzSessionPlan): readonly HifzExercise[] {
  if (plan.kind !== "plan") return [];
  const used = new Set<HifzExercise>(plan.steps.map((step) => step.exercise));
  return EXERCISE_LADDER.filter((exercise) => used.has(exercise));
}
