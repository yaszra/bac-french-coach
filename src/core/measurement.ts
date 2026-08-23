/**
 * Measurement.
 *
 * The product's own scoreboard, computed the same way the brief states it,
 * so a good-looking number cannot be produced by choosing a friendlier
 * definition later.
 *
 * North star: **the proportion of scheduled passages independently
 * recalled after the target delay, weighted by learner effort and required
 * teacher time.**
 *
 * The guardrail that matters most is `falseConfidence`: scaffolded success
 * that did not survive to independent recall. It measures whether we are
 * fooling ourselves, which is the failure this product exists to avoid.
 */
import type { EpochMs } from "./types.js";

export const MEASUREMENT_VERSION = "athar-measurement/1.0.0";

export interface ScheduledRecallObservation {
  learnerId: string;
  targetId: string;
  /** Days between the scheduled review and the previous recall. */
  delayDays: number;
  /** Was the review actually attempted cue-free, unassisted? */
  independent: boolean;
  correct: boolean;
  occurredAt: EpochMs;
  /** Active minutes the learner spent on this target in the period. */
  learnerActiveMinutes: number;
  /** Teacher minutes spent verifying this target in the period. */
  teacherMinutes: number;
}

export interface ScaffoldedSuccessObservation {
  learnerId: string;
  targetId: string;
  /** A scaffolded or assisted attempt that was correct. */
  succeededAt: EpochMs;
  /** Did a later cue-free attempt on the same target succeed? */
  laterIndependentSuccess: boolean;
  /** Undefined when no later independent attempt has happened yet. */
  laterAttemptExists: boolean;
}

/**
 * A rate that refuses to exist without its denominator.
 *
 * `value` is undefined when there is nothing to divide by, so a caller
 * cannot render "0%" for "we have not measured this".
 */
export interface Rate {
  numerator: number;
  denominator: number;
  value: number | undefined;
  /** Plain-language statement, always safe to display verbatim. */
  statement: string;
}

export function rate(numerator: number, denominator: number, what: string): Rate {
  if (denominator === 0)
    return {
      numerator,
      denominator,
      value: undefined,
      statement: `No ${what} recorded yet.`,
    };
  return {
    numerator,
    denominator,
    value: numerator / denominator,
    statement: `${numerator} of ${denominator} ${what}.`,
  };
}

export interface NorthStar {
  /** Unweighted: proportion of scheduled recalls that succeeded, cue-free. */
  independentRecallRate: Rate;
  /** Per learner-hour of active practice. */
  recallsPerLearnerHour: number | undefined;
  /** Per teacher-hour spent verifying — the buyer's actual currency. */
  recallsPerTeacherHour: number | undefined;
  /** Observations excluded because the recall was not cue-free. */
  excludedAsAssisted: number;
  /** Observations excluded because the delay was below target. */
  excludedAsTooSoon: number;
  version: string;
}

/**
 * Compute the north star over a period.
 *
 * Assisted attempts are excluded rather than counted as failures: they say
 * nothing about independent recall in either direction, and counting them
 * as misses would make the metric improve whenever a learner stopped
 * asking for help.
 */
export function northStar(
  observations: readonly ScheduledRecallObservation[],
  targetDelayDays: number,
): NorthStar {
  const eligible = observations.filter(
    (o) => o.independent && o.delayDays >= targetDelayDays,
  );
  const excludedAsAssisted = observations.filter((o) => !o.independent).length;
  const excludedAsTooSoon = observations.filter(
    (o) => o.independent && o.delayDays < targetDelayDays,
  ).length;

  const succeeded = eligible.filter((o) => o.correct).length;
  const learnerMinutes = eligible.reduce((n, o) => n + o.learnerActiveMinutes, 0);
  const teacherMinutes = eligible.reduce((n, o) => n + o.teacherMinutes, 0);

  return {
    independentRecallRate: rate(
      succeeded,
      eligible.length,
      "scheduled passages recalled independently after the target delay",
    ),
    recallsPerLearnerHour:
      learnerMinutes > 0 ? succeeded / (learnerMinutes / 60) : undefined,
    recallsPerTeacherHour:
      teacherMinutes > 0 ? succeeded / (teacherMinutes / 60) : undefined,
    excludedAsAssisted,
    excludedAsTooSoon,
    version: MEASUREMENT_VERSION,
  };
}

export interface Guardrails {
  /** Scaffolded success that never became independent recall. */
  falseConfidence: Rate;
  verifiedToEstablished: Rate;
  establishedToDurable: Rate;
  correctionRecurrence: Rate;
  reviewBacklog: { overdue: number; due: number };
  teacherMinutesPerVerifiedLearner: number | undefined;
  /** Active learning minutes, distinct from wall-clock session time. */
  activeMinutes: number;
  wallClockMinutes: number;
  /** Abandonment during cue withdrawal — the riskiest moment in the loop. */
  cueWithdrawalAbandonment: Rate;
  version: string;
}

export interface GuardrailInput {
  scaffoldedSuccesses: readonly ScaffoldedSuccessObservation[];
  verifiedCount: number;
  establishedCount: number;
  durableCount: number;
  correctionsTotal: number;
  correctionsRecurring: number;
  overdueReviews: number;
  dueReviews: number;
  teacherMinutes: number;
  verifiedLearners: number;
  activeMinutes: number;
  wallClockMinutes: number;
  cueWithdrawalStarts: number;
  cueWithdrawalAbandons: number;
}

export function guardrails(input: GuardrailInput): Guardrails {
  // Only successes with a later independent attempt can be judged: one
  // that has not been re-tested yet is unknown, not false.
  const judgeable = input.scaffoldedSuccesses.filter((s) => s.laterAttemptExists);
  const falsePositives = judgeable.filter((s) => !s.laterIndependentSuccess).length;

  return {
    falseConfidence: rate(
      falsePositives,
      judgeable.length,
      "scaffolded successes did not survive to independent recall",
    ),
    verifiedToEstablished: rate(
      input.establishedCount,
      input.verifiedCount,
      "verified passages later recalled after a delay",
    ),
    establishedToDurable: rate(
      input.durableCount,
      input.establishedCount,
      "established passages became durable",
    ),
    correctionRecurrence: rate(
      input.correctionsRecurring,
      input.correctionsTotal,
      "corrections recurred",
    ),
    reviewBacklog: { overdue: input.overdueReviews, due: input.dueReviews },
    teacherMinutesPerVerifiedLearner:
      input.verifiedLearners > 0
        ? input.teacherMinutes / input.verifiedLearners
        : undefined,
    activeMinutes: input.activeMinutes,
    wallClockMinutes: input.wallClockMinutes,
    cueWithdrawalAbandonment: rate(
      input.cueWithdrawalAbandons,
      input.cueWithdrawalStarts,
      "learners abandoned the session during cue withdrawal",
    ),
    version: MEASUREMENT_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Experiment discipline
// ---------------------------------------------------------------------------

export interface PreRegistration {
  experimentKey: string;
  /** What we think will improve, and why. Not "we'll see what happens." */
  learningHypothesis: string;
  /** Must be a delayed-recall outcome. Engagement is not a primary. */
  primaryOutcome: "independent_recall_after_delay";
  guardrails: readonly (keyof Guardrails)[];
  population: string;
  durationDays: number;
  stoppingRule: string;
}

export type ShipDecision =
  | { ship: true; reason: string }
  | { ship: false; reason: string };

export interface ExperimentResult {
  registration: PreRegistration;
  /** Change in the primary outcome. Positive is better. */
  primaryDelta: number;
  /** Observations behind the primary. */
  primarySampleSize: number;
  /** Guardrails that moved the wrong way. */
  guardrailRegressions: readonly string[];
  /** Engagement change, recorded but never sufficient on its own. */
  engagementDelta: number;
  daysRun: number;
}

/**
 * Whether an experiment may ship.
 *
 * The rule that does the work: **an experiment that raises engagement and
 * lowers delayed recall is a failed experiment.** Engagement never appears
 * on the shipping path here — it is recorded so that a rise can be
 * reported alongside a refusal.
 */
export function shouldShip(
  result: ExperimentResult,
  opts: { minSampleSize?: number } = {},
): ShipDecision {
  const minSample = opts.minSampleSize ?? 200;

  if (result.daysRun < result.registration.durationDays)
    return {
      ship: false,
      reason: `Pre-registered for ${result.registration.durationDays} days; ran ${result.daysRun}. Stopping early on a favourable reading is how a null result becomes a launch.`,
    };

  if (result.primarySampleSize < minSample)
    return {
      ship: false,
      reason: `Only ${result.primarySampleSize} delayed-recall observations; ${minSample} were required to distinguish an effect from noise.`,
    };

  if (result.guardrailRegressions.length > 0)
    return {
      ship: false,
      reason: `Guardrails regressed: ${result.guardrailRegressions.join(", ")}.`,
    };

  if (result.primaryDelta <= 0)
    return {
      ship: false,
      reason:
        result.engagementDelta > 0
          ? "Engagement rose but delayed recall did not. That is a failed experiment, not a trade-off."
          : "Delayed recall did not improve.",
    };

  return {
    ship: true,
    reason: `Delayed recall improved by ${(result.primaryDelta * 100).toFixed(1)} percentage points with no guardrail regression.`,
  };
}
