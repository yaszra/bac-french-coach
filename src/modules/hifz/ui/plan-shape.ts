/**
 * Shaping a session plan into the one thing a learner sees first.
 *
 * The five-second test: open Today, and know what to do. That means the plan has
 * to collapse to exactly ONE primary action plus its reason, and everything else
 * has to be honest about its denominator.
 *
 * Three rules this module will not bend:
 *
 * 1. **Nothing due is a real answer.** An empty plan carries its reason key and
 *    an offer of maintenance reading. It never invents a task to fill a screen.
 * 2. **Every rate carries its denominator.** `done` is never shown without
 *    `total`, and a total of zero is reported as "nothing recorded", not 0%.
 * 3. **A missed day is not a red mark.** The streak has grace built in, and it
 *    reports the grace rather than a broken chain.
 *
 * Pure: no clock of its own, no I/O. `now` is supplied.
 */

import { MS_PER_DAY } from "@/modules/memory/domain/time";
import type { RecommendedAction } from "@/modules/memory/domain/policy";
import type { Reason } from "@/modules/memory/domain/types";
import type { HifzSessionPlan, PlannedStep } from "../domain/sessionPlan";
import type { HifzExercise } from "../domain/exercises";

/* ------------------------------------------------------------ the one action */

export interface PrimaryAction {
  readonly unitId: string;
  readonly action: RecommendedAction;
  readonly exercise: HifzExercise;
  readonly estimatedMinutes: number;
  /** The policy's machine-readable "why this?", carried through unchanged. */
  readonly reason: Reason;
}

export type TodayHeadline =
  | { readonly kind: "action"; readonly primary: PrimaryAction; readonly remainingSteps: number }
  | {
      /** Nothing to do, and the reason why — never dressed up as a rest day earned. */
      readonly kind: "nothing_due";
      readonly reasonKey: "hifz.plan.nothing_due" | "hifz.plan.budget_too_small";
      /** Maintenance reading is offered, never assigned: it is not evidence. */
      readonly offersMaintenance: boolean;
    };

/** Collapse a plan to its headline. A plan always names its first action. */
export function headlineOf(
  plan: HifzSessionPlan,
  options: { readonly canReadForMaintenance?: boolean } = {},
): TodayHeadline {
  if (plan.kind === "empty") {
    return {
      kind: "nothing_due",
      reasonKey: plan.reason,
      offersMaintenance: options.canReadForMaintenance ?? false,
    };
  }
  return {
    kind: "action",
    primary: {
      unitId: plan.firstAction.unitId,
      action: plan.firstAction.action,
      exercise: plan.firstAction.exercise,
      estimatedMinutes: plan.firstAction.estimatedMinutes,
      reason: plan.firstAction.reason,
    },
    remainingSteps: Math.max(0, plan.steps.length - 1),
  };
}

/* ------------------------------------------------------- counts with meaning */

/**
 * A count that cannot be shown without what it is out of.
 *
 * `total` 0 is not an error and not zero percent: it is "nothing recorded", and
 * `hasDenominator` says so, so a caller physically cannot render a bare rate.
 */
export interface Counted {
  readonly done: number;
  readonly total: number;
  readonly hasDenominator: boolean;
}

export function counted(done: number, total: number): Counted {
  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0;
  const safeDone = Number.isFinite(done) ? Math.max(0, Math.trunc(done)) : 0;
  return {
    done: Math.min(safeDone, safeTotal),
    total: safeTotal,
    hasDenominator: safeTotal > 0,
  };
}

/** The rate, or `null` when there is no denominator. Never 0/0 rendered as 0%. */
export function rateOf(value: Counted): number | null {
  return value.hasDenominator ? value.done / value.total : null;
}

/* --------------------------------------------------------------- the streams */

/**
 * The adult's three-stream rhythm: what is new, what is recent, what is old.
 *
 * The split is by the age of the memory, not by how well it went: `new` is
 * material with nothing recorded, `recent` is what is still consolidating, `old`
 * is what has held long enough to be maintenance.
 */
export const STREAMS = ["new", "recent", "old"] as const;
export type Stream = (typeof STREAMS)[number];

/** Stability, in days, above which a unit counts as `old` rather than `recent`. */
export const OLD_STREAM_STABILITY_DAYS = 21;

export interface StreamInput {
  readonly unitId: string;
  readonly action: RecommendedAction;
  /** `null` when nothing has been recorded for the unit. */
  readonly stabilityDays: number | null;
}

export function streamOf(item: StreamInput): Stream {
  if (item.action === "learn_new" || item.stabilityDays === null) return "new";
  return item.stabilityDays >= OLD_STREAM_STABILITY_DAYS ? "old" : "recent";
}

export type StreamCounts = Readonly<Record<Stream, number>>;

export function streamCounts(items: readonly StreamInput[]): StreamCounts {
  const counts: Record<Stream, number> = { new: 0, recent: 0, old: 0 };
  for (const item of items) counts[streamOf(item)] += 1;
  return counts;
}

/* ------------------------------------------------------- the kids' three steps */

/**
 * A child sees three doors, always the same three, in the same order:
 * listen → build → say it. The plan decides which one is lit, not how many
 * there are — a changing number of steps is a moving target for a five-year-old.
 */
export const KID_STEPS = ["listen", "rebuild", "oral_recitation"] as const;
export type KidStep = (typeof KID_STEPS)[number];

/** Which of the three doors this exercise belongs behind. */
export function kidStepFor(exercise: HifzExercise): KidStep {
  if (exercise === "listen") return "listen";
  if (exercise === "oral_recitation") return "oral_recitation";
  return "rebuild";
}

export function kidStepIndex(step: KidStep): 0 | 1 | 2 {
  return step === "listen" ? 0 : step === "rebuild" ? 1 : 2;
}

/* ------------------------------------------------------------------- streaks */

/**
 * A streak that cannot shame anyone.
 *
 * One missed day is spent from a grace allowance rather than breaking the chain,
 * and the result says how much grace is left instead of showing a gap. Only when
 * the grace runs out does the streak restart — and even then it restarts at
 * whatever was actually practised, never at a scolding.
 */
export interface StreakConfig {
  /** Missed days forgiven inside the window before the run restarts. */
  readonly graceDays: number;
  /** How far back to look. Beyond this the run is simply not claimed. */
  readonly windowDays: number;
}

export const DEFAULT_STREAK_CONFIG: StreakConfig = { graceDays: 1, windowDays: 60 };

export interface Streak {
  /** Consecutive days practised, counting forgiven gaps as unbroken. */
  readonly days: number;
  /** Missed days inside the current run that grace has covered. */
  readonly graceUsed: number;
  readonly graceRemaining: number;
  /** True when today has not been practised yet — a fact, never a warning. */
  readonly restingToday: boolean;
}

function dayNumber(at: Date): number {
  return Math.floor(at.getTime() / MS_PER_DAY);
}

/**
 * Build the streak from the days a learner actually produced evidence.
 *
 * `days` may contain duplicates and any order; only the calendar day (UTC)
 * matters. Days in the future are ignored rather than trusted.
 */
export function streakOf(
  practisedAt: readonly Date[],
  now: Date,
  config: StreakConfig = DEFAULT_STREAK_CONFIG,
): Streak {
  const today = dayNumber(now);
  const practised = new Set<number>();
  for (const at of practisedAt) {
    const day = dayNumber(at);
    if (day <= today && today - day <= config.windowDays) practised.add(day);
  }

  const restingToday = !practised.has(today);
  let graceUsed = 0;
  let days = 0;
  for (let offset = 0; offset <= config.windowDays; offset += 1) {
    const day = today - offset;
    if (practised.has(day)) {
      days += 1;
      continue;
    }
    // Today is not yet spent: not practising *yet* is not a missed day at all.
    if (offset === 0) continue;
    if (graceUsed < config.graceDays) {
      graceUsed += 1;
      continue;
    }
    break;
  }

  return {
    days,
    graceUsed,
    graceRemaining: Math.max(0, config.graceDays - graceUsed),
    restingToday,
  };
}

/* ---------------------------------------------------------------- the goal */

export type GoalState =
  | { readonly kind: "not_set" }
  | { readonly kind: "set"; readonly progress: Counted; readonly met: boolean };

/**
 * The tier's goal for today. A goal of zero is "not set" — never a goal of zero
 * met the moment the page loads.
 */
export function goalStateOf(goalUnits: number, doneUnits: number): GoalState {
  const total = Number.isFinite(goalUnits) ? Math.max(0, Math.trunc(goalUnits)) : 0;
  if (total === 0) return { kind: "not_set" };
  const progress = counted(doneUnits, total);
  return { kind: "set", progress, met: progress.done >= progress.total };
}

/* -------------------------------------------------------------- step lookup */

/** Find a planned step by unit id, so a deep link can be validated against the plan. */
export function stepFor(plan: HifzSessionPlan, unitId: string): PlannedStep | null {
  if (plan.kind !== "plan") return null;
  return plan.steps.find((step) => step.unitId === unitId) ?? null;
}

/** The step after the given one, or `null` at the end of the session. */
export function nextStepAfter(plan: HifzSessionPlan, unitId: string): PlannedStep | null {
  if (plan.kind !== "plan") return null;
  const at = plan.steps.findIndex((step) => step.unitId === unitId);
  if (at < 0) return null;
  return plan.steps[at + 1] ?? null;
}
