/**
 * Motivation.
 *
 * Rewards behaviour that predicts learning — returning for a scheduled
 * review, completing an independent recall, repairing a recurring
 * correction, asking for help, judging one's own certainty honestly.
 *
 * What is absent is the design: no coins, no loot, no energy timers, no
 * hearts that block study, no streak-loss threats, no confetti over sacred
 * text, no XP grind, no bottom-of-class ranking. None of those appear as a
 * disabled option or a config flag; there is simply nothing here that
 * could produce them.
 *
 * The one rule that does the heavy lifting: **a milestone is earned only
 * from verified or delayed evidence.** Time spent earns nothing.
 */
import type { EpochMs } from "./types.js";
import { MS_PER_DAY } from "./types.js";

export const MOTIVATION_VERSION = "athar-motivation/1.0.0";

/** Behaviours worth recognising, all of which predict durable recall. */
export type MilestoneKind =
  | "first_verified_passage"
  | "delayed_recall_survived"
  | "correction_repaired"
  | "returned_for_scheduled_review"
  | "asked_for_help"
  | "honest_self_assessment"
  | "steady_week";

export interface Milestone {
  kind: MilestoneKind;
  awardedAt: EpochMs;
  /** The evidence that earned it. A milestone without one cannot exist. */
  evidenceRef: string;
  /** Shown to the learner. Encouraging, never effusive. */
  message: string;
}

export interface MilestoneEvidence {
  verifiedPassages: number;
  /** Independent recalls that succeeded after the target delay. */
  delayedRecallsSurvived: number;
  correctionsRepaired: number;
  /** Reviews begun within a day of when they were scheduled. */
  scheduledReviewsHonoured: number;
  helpRequests: number;
  /** Attempts where stated confidence matched the outcome. */
  calibratedJudgements: number;
  /** Days this week with any recorded independent recall. */
  activeDaysThisWeek: number;
}

const MESSAGES: Record<MilestoneKind, string> = {
  first_verified_passage: "Your teacher verified a passage for the first time.",
  delayed_recall_survived: "You recalled this on your own after a real gap.",
  correction_repaired: "A correction you had been carrying is now resolved.",
  returned_for_scheduled_review: "You came back for your review when it was due.",
  asked_for_help: "Asking for help is part of learning well.",
  honest_self_assessment: "Your sense of what you know is getting accurate.",
  steady_week: "A steady week — spaced practice is what makes memory last.",
};

/**
 * Award milestones from evidence.
 *
 * Every branch reads a count of something a human verified or a delay
 * proved. There is no branch reading elapsed time, sessions opened, or
 * screens viewed, because rewarding those would teach a learner to produce
 * them.
 */
export function awardMilestones(
  evidence: MilestoneEvidence,
  alreadyAwarded: ReadonlySet<MilestoneKind>,
  now: EpochMs,
): readonly Milestone[] {
  const awarded: Milestone[] = [];
  const add = (kind: MilestoneKind, evidenceRef: string) => {
    if (alreadyAwarded.has(kind)) return;
    awarded.push({ kind, awardedAt: now, evidenceRef, message: MESSAGES[kind] });
  };

  if (evidence.verifiedPassages >= 1)
    add("first_verified_passage", `verified_passages=${evidence.verifiedPassages}`);
  if (evidence.delayedRecallsSurvived >= 1)
    add("delayed_recall_survived", `delayed_recalls=${evidence.delayedRecallsSurvived}`);
  if (evidence.correctionsRepaired >= 1)
    add("correction_repaired", `corrections_repaired=${evidence.correctionsRepaired}`);
  if (evidence.scheduledReviewsHonoured >= 3)
    add(
      "returned_for_scheduled_review",
      `scheduled_reviews=${evidence.scheduledReviewsHonoured}`,
    );
  if (evidence.helpRequests >= 1)
    add("asked_for_help", `help_requests=${evidence.helpRequests}`);
  if (evidence.calibratedJudgements >= 5)
    add("honest_self_assessment", `calibrated=${evidence.calibratedJudgements}`);
  // Four days, not seven: a target that requires perfection teaches a
  // learner to give up on the fifth day.
  if (evidence.activeDaysThisWeek >= 4)
    add("steady_week", `active_days=${evidence.activeDaysThisWeek}`);

  return awarded;
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

export interface StreakState {
  /** Consecutive days with recorded independent recall. */
  currentDays: number;
  longestDays: number;
  lastActiveAt: EpochMs | null;
  /** Set while a compassionate pause is in effect. */
  pausedUntil: EpochMs | null;
  pauseReason: string | null;
}

export const initialStreak: StreakState = {
  currentDays: 0,
  longestDays: 0,
  lastActiveAt: null,
  pausedUntil: null,
  pauseReason: null,
};

export const streakParams = {
  /** Missed days forgiven automatically before a streak resets. */
  graceDays: 1,
  /** Longest pause an adult can set in one go. */
  maxPauseDays: 30,
} as const;

export interface StreakUpdate {
  streak: StreakState;
  /** Encouraging or neutral. Never a warning, never a threat. */
  message: string;
}

/**
 * Fold a day of activity into the streak.
 *
 * A missed day inside the grace window, or any day inside a pause, keeps
 * the streak. Nothing here produces a warning about losing one: the
 * product builds consistency without turning absence into shame.
 */
export function recordActivity(
  streak: StreakState,
  at: EpochMs,
): StreakUpdate {
  if (streak.lastActiveAt === null) {
    const next = { ...streak, currentDays: 1, longestDays: Math.max(1, streak.longestDays), lastActiveAt: at };
    return { streak: next, message: "First day recorded." };
  }

  const gapDays = Math.floor((at - streak.lastActiveAt) / MS_PER_DAY);
  if (gapDays === 0) return { streak, message: "Already recorded today." };

  const paused =
    streak.pausedUntil !== null && at <= streak.pausedUntil;
  const withinGrace = gapDays <= streakParams.graceDays + 1;

  const currentDays =
    paused || withinGrace ? streak.currentDays + 1 : 1;

  return {
    streak: {
      ...streak,
      currentDays,
      longestDays: Math.max(streak.longestDays, currentDays),
      lastActiveAt: at,
      // Activity ends a pause: the learner is back, and the pause has done
      // its job.
      pausedUntil: null,
      pauseReason: null,
    },
    message:
      currentDays === 1 && streak.currentDays > 1
        ? "Starting again. Your longest run is still recorded."
        : `${currentDays} ${currentDays === 1 ? "day" : "days"} of practice.`,
  };
}

export class PauseTooLongError extends Error {
  constructor(days: number) {
    super(
      `A pause of ${days} days exceeds the ${streakParams.maxPauseDays}-day maximum; set a shorter one and extend it if needed.`,
    );
    this.name = "PauseTooLongError";
  }
}

/**
 * Pause a streak compassionately.
 *
 * Illness, travel, exams, bereavement. Set by an adult, no justification
 * demanded beyond a note, and the streak survives.
 */
export function pauseStreak(
  streak: StreakState,
  input: { from: EpochMs; days: number; reason: string },
): StreakState {
  if (input.days > streakParams.maxPauseDays)
    throw new PauseTooLongError(input.days);
  return {
    ...streak,
    pausedUntil: input.from + input.days * MS_PER_DAY,
    pauseReason: input.reason,
  };
}

/**
 * What to show about a streak.
 *
 * Returns a neutral statement, never a countdown or a warning. There is no
 * "you will lose your streak in N hours" because that sentence turns a
 * learning tool into a source of anxiety.
 */
export function describeStreak(streak: StreakState, now: EpochMs): string {
  if (streak.pausedUntil !== null && now <= streak.pausedUntil)
    return "Your practice is paused. Nothing is being lost.";
  if (streak.currentDays === 0) return "No practice recorded yet.";
  return `${streak.currentDays} ${streak.currentDays === 1 ? "day" : "days"} of practice${
    streak.longestDays > streak.currentDays
      ? `. Your longest run is ${streak.longestDays} days.`
      : "."
  }`;
}

// ---------------------------------------------------------------------------
// The private night sky
// ---------------------------------------------------------------------------

/**
 * A child's private reward surface.
 *
 * Private by design: it is never comparable to another child's, because a
 * comparable reward is a ranking with extra steps. Each point is revealed
 * by a milestone, so the sky fills from evidence rather than from hours.
 */
export interface NightSky {
  /** Revealed points, one per milestone earned. */
  revealed: readonly { kind: MilestoneKind; awardedAt: EpochMs }[];
  /** Total points available. Fixed, so the sky is finite and reachable. */
  total: number;
  /** Never shown to another learner, never aggregated into a leaderboard. */
  private: true;
}

export const NIGHT_SKY_TOTAL = 60;

export function buildNightSky(milestones: readonly Milestone[]): NightSky {
  return {
    revealed: milestones.map((m) => ({ kind: m.kind, awardedAt: m.awardedAt })),
    total: NIGHT_SKY_TOTAL,
    private: true,
  };
}
