/**
 * Mastery — ear-gated, and never a bare percentage.
 *
 * Four levels, and the first one is the honest one:
 *
 * - `not_yet_recorded` — nothing has been observed. This is a real answer. It is
 *   never rendered as 0%, because 0% is a claim about a learner and this is not.
 * - `learning`         — machine evidence exists; no person has confirmed it yet.
 *   However strong the scheduler's belief, it stops here.
 * - `held`             — a person listened and confirmed it, and the memory still
 *   holds it now.
 * - `maintained`       — confirmed more than once, over a long interval, and still
 *   holding.
 *
 * Every rate this module returns carries its denominator (`Rate` from the memory
 * engine: `{numerator, denominator, rate}` with `rate: null` when the denominator is
 * zero). There is no code path that produces a percentage on its own.
 *
 * Pure: no clock, no I/O. When no `now` is supplied, the module reasons "as of the
 * last recorded evidence" rather than reading a clock.
 */

import { retrievability, DEFAULT_SCHEDULING_POLICY } from "@/modules/memory/domain/fsrs";
import { rate, type Rate } from "@/modules/memory/domain/numeric";
import { hasEvidence } from "@/modules/memory/domain/types";
import type { MemoryState, SchedulingPolicy, UnitId } from "@/modules/memory/domain/types";
import type { HumanVerdict } from "./stateMachine";

export const MASTERY_LEVELS = ["not_yet_recorded", "learning", "held", "maintained"] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

/** Denominators, always reported alongside the level. */
export interface MasteryDenominator {
  /** Recorded reviews of this unit (the memory engine's `reps`). */
  readonly reviews: number;
  /** Times a person listened and reached a verdict. `not_heard` is not a verdict. */
  readonly verifications: number;
}

export interface Mastery {
  readonly unitId: UnitId;
  readonly level: MasteryLevel;
  /** When a person last confirmed it, or `null` — never a guess. */
  readonly verifiedAt: Date | null;
  readonly denominator: MasteryDenominator;
  /** Successful reviews over recorded reviews. `rate` is `null` at zero reviews. */
  readonly retention: Rate;
  /** Confirmations over verdicts heard. `rate` is `null` when nobody has listened. */
  readonly verification: Rate;
  /** Modelled recall at `asOf`, or `null` when nothing is recorded. */
  readonly retrievability: number | null;
  /** The moment this judgement is about, or `null` when nothing is recorded. */
  readonly asOf: Date | null;
  /** Stable i18n key explaining the level. Never literal text. */
  readonly reason: string;
}

export interface MasteryConfig {
  /** Below this modelled recall, a confirmed unit is not currently being held. */
  readonly heldRetrievability: number;
  /** Confirmations required before a unit counts as maintained. */
  readonly maintainedVerifications: number;
  /** Stability, in days, required before a unit counts as maintained. */
  readonly maintainedStabilityDays: number;
  /** Modelled recall required before a unit counts as maintained. */
  readonly maintainedRetrievability: number;
}

/**
 * Defaults, and why:
 * - `heldRetrievability` 0.7: the scheduler targets 0.90 at the review date, so 0.70
 *   is comfortably past due — the unit is not being held right now.
 * - `maintained` wants a second ear at least, two months of stability and recall at
 *   0.85: one good day is not maintenance.
 */
export const DEFAULT_MASTERY_CONFIG: MasteryConfig = {
  heldRetrievability: 0.7,
  maintainedVerifications: 2,
  maintainedStabilityDays: 60,
  maintainedRetrievability: 0.85,
};

export interface MasteryContext {
  /** The moment to judge. Defaults to the latest recorded evidence. */
  readonly now?: Date;
  /**
   * When the unit last lapsed, if the caller has projected it from the event log.
   * A lapse after a confirmation demotes the unit — the ear was right then, not now.
   */
  readonly lastLapseAt?: Date | null;
  readonly config?: MasteryConfig;
  readonly scheduling?: SchedulingPolicy;
}

function latestVerdictTime(verdicts: readonly HumanVerdict[]): Date | null {
  let latest: Date | null = null;
  for (const verdict of verdicts) {
    if (latest === null || verdict.at.getTime() > latest.getTime()) latest = verdict.at;
  }
  return latest;
}

/**
 * The mastery of one unit.
 *
 * `verdicts` may be the learner's whole verdict list: anything for another unit is
 * ignored rather than counted, so a caller cannot inflate a unit with a neighbour's
 * verification by passing the wrong slice.
 */
export function masteryOf(
  unitId: UnitId,
  memoryState: MemoryState | null,
  verdicts: readonly HumanVerdict[],
  context: MasteryContext = {},
): Mastery {
  const config = context.config ?? DEFAULT_MASTERY_CONFIG;
  const scheduling = context.scheduling ?? DEFAULT_SCHEDULING_POLICY;

  const mine = verdicts.filter((verdict) => verdict.unitId === unitId);
  const assessed = mine.filter((verdict) => verdict.outcome !== "not_heard");
  const confirmations = assessed.filter((verdict) => verdict.outcome === "verified");

  const state = memoryState !== null && memoryState.unitId === unitId ? memoryState : null;
  const recorded = state !== null && hasEvidence(state);
  const reviews = recorded ? state.reps : 0;
  const lapses = recorded ? state.lapses : 0;

  const denominator: MasteryDenominator = { reviews, verifications: assessed.length };
  const retention = rate(Math.max(reviews - lapses, 0), reviews);
  const verification = rate(confirmations.length, assessed.length);

  // Nothing observed at all. Not zero — nothing.
  if (reviews === 0 && assessed.length === 0) {
    return {
      unitId,
      level: "not_yet_recorded",
      verifiedAt: null,
      denominator,
      retention,
      verification,
      retrievability: null,
      asOf: null,
      reason: "hifz.mastery.not_yet_recorded",
    };
  }

  const lastEvidenceAt = latestVerdictTime(mine);
  const stateAt = state?.lastReviewAt ?? null;
  const fallbackNow =
    lastEvidenceAt !== null && stateAt !== null
      ? new Date(Math.max(lastEvidenceAt.getTime(), stateAt.getTime()))
      : (lastEvidenceAt ?? stateAt);
  const asOf = context.now ?? fallbackNow;

  const recall =
    state !== null && asOf !== null ? retrievability(state, asOf, scheduling) : null;

  const verifiedAt = latestVerdictTime(confirmations);
  if (verifiedAt === null) {
    return {
      unitId,
      level: "learning",
      verifiedAt: null,
      denominator,
      retention,
      verification,
      retrievability: recall,
      asOf,
      reason:
        assessed.length > 0
          ? "hifz.mastery.heard_not_confirmed"
          : "hifz.mastery.awaiting_first_verification",
    };
  }

  // A "needs work" heard after the last confirmation overrides it: the newest ear wins.
  const laterNeedsWork = assessed.some(
    (verdict) =>
      verdict.outcome === "needs_work" && verdict.at.getTime() > verifiedAt.getTime(),
  );
  if (laterNeedsWork) {
    return {
      unitId,
      level: "learning",
      verifiedAt,
      denominator,
      retention,
      verification,
      retrievability: recall,
      asOf,
      reason: "hifz.mastery.needs_work_since_verification",
    };
  }

  const lapseAt = context.lastLapseAt ?? null;
  if (lapseAt !== null && lapseAt.getTime() > verifiedAt.getTime()) {
    return {
      unitId,
      level: "learning",
      verifiedAt,
      denominator,
      retention,
      verification,
      retrievability: recall,
      asOf,
      reason: "hifz.mastery.lapsed_since_verification",
    };
  }

  if (recall !== null && recall < config.heldRetrievability) {
    return {
      unitId,
      level: "learning",
      verifiedAt,
      denominator,
      retention,
      verification,
      retrievability: recall,
      asOf,
      reason: "hifz.mastery.recall_below_hold",
    };
  }

  const maintained =
    confirmations.length >= config.maintainedVerifications &&
    state !== null &&
    state.stability >= config.maintainedStabilityDays &&
    recall !== null &&
    recall >= config.maintainedRetrievability;

  return {
    unitId,
    level: maintained ? "maintained" : "held",
    verifiedAt,
    denominator,
    retention,
    verification,
    retrievability: recall,
    asOf,
    reason: maintained ? "hifz.mastery.maintained" : "hifz.mastery.held",
  };
}

/* ------------------------------------------------------------------ rollups */

export interface MasterySummary {
  readonly counts: Readonly<Record<MasteryLevel, number>>;
  readonly units: number;
  /** Units a person has confirmed, over units with any record at all. */
  readonly confirmed: Rate;
  /** Units with any record at all, over every unit asked about. */
  readonly recorded: Rate;
}

/**
 * Roll several units up without ever inventing a denominator: units that are
 * `not_yet_recorded` stay visible as their own count and are excluded from the
 * confirmed rate's denominator, so a page nobody has started never reads as 0%
 * mastered — it reads as "not yet recorded".
 */
export function summariseMastery(items: readonly Mastery[]): MasterySummary {
  const counts: Record<MasteryLevel, number> = {
    not_yet_recorded: 0,
    learning: 0,
    held: 0,
    maintained: 0,
  };
  for (const item of items) counts[item.level] += 1;
  const recordedUnits = items.length - counts.not_yet_recorded;
  return {
    counts,
    units: items.length,
    confirmed: rate(counts.held + counts.maintained, recordedUnits),
    recorded: rate(recordedUnits, items.length),
  };
}
