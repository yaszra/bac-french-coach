/**
 * Productive motivation — docs §11.
 *
 * Rewards behaviour that predicts learning, and never turns absence into
 * shame.
 */
import { describe, expect, it } from "vitest";
import {
  NIGHT_SKY_TOTAL,
  PauseTooLongError,
  awardMilestones,
  buildNightSky,
  describeStreak,
  initialStreak,
  pauseStreak,
  recordActivity,
  streakParams,
  type MilestoneEvidence,
  type MilestoneKind,
} from "../src/core/motivation.js";
import { MS_PER_DAY } from "../src/core/types.js";

const T0 = Date.UTC(2026, 8, 1, 9, 0, 0);
const day = (n: number) => T0 + n * MS_PER_DAY;

const none = new Set<MilestoneKind>();

function evidence(over: Partial<MilestoneEvidence> = {}): MilestoneEvidence {
  return {
    verifiedPassages: 0,
    delayedRecallsSurvived: 0,
    correctionsRepaired: 0,
    scheduledReviewsHonoured: 0,
    helpRequests: 0,
    calibratedJudgements: 0,
    activeDaysThisWeek: 0,
    ...over,
  };
}

describe("milestones come only from evidence", () => {
  it("awards nothing for a learner with no evidence at all", () => {
    expect(awardMilestones(evidence(), none, T0)).toEqual([]);
  });

  it("awards a first verified passage", () => {
    const [milestone] = awardMilestones(evidence({ verifiedPassages: 1 }), none, T0);
    expect(milestone?.kind).toBe("first_verified_passage");
    expect(milestone?.evidenceRef).toBe("verified_passages=1");
  });

  it("awards delayed recall, which is the outcome that matters", () => {
    const kinds = awardMilestones(
      evidence({ delayedRecallsSurvived: 1 }),
      none,
      T0,
    ).map((m) => m.kind);
    expect(kinds).toContain("delayed_recall_survived");
  });

  it("rewards asking for help", () => {
    const kinds = awardMilestones(evidence({ helpRequests: 1 }), none, T0).map(
      (m) => m.kind,
    );
    expect(kinds).toContain("asked_for_help");
  });

  it("rewards honest self-assessment, never punishing it", () => {
    const kinds = awardMilestones(
      evidence({ calibratedJudgements: 5 }),
      none,
      T0,
    ).map((m) => m.kind);
    expect(kinds).toContain("honest_self_assessment");
  });

  it("sets a steady week at four days, not seven", () => {
    // A target requiring perfection teaches a learner to give up on day five.
    expect(
      awardMilestones(evidence({ activeDaysThisWeek: 3 }), none, T0).map((m) => m.kind),
    ).not.toContain("steady_week");
    expect(
      awardMilestones(evidence({ activeDaysThisWeek: 4 }), none, T0).map((m) => m.kind),
    ).toContain("steady_week");
  });

  it("never awards the same milestone twice", () => {
    const already = new Set<MilestoneKind>(["first_verified_passage"]);
    const kinds = awardMilestones(
      evidence({ verifiedPassages: 5 }),
      already,
      T0,
    ).map((m) => m.kind);
    expect(kinds).not.toContain("first_verified_passage");
  });

  it("attaches the evidence to every milestone", () => {
    const milestones = awardMilestones(
      evidence({
        verifiedPassages: 2,
        delayedRecallsSurvived: 3,
        correctionsRepaired: 1,
      }),
      none,
      T0,
    );
    expect(milestones.length).toBeGreaterThan(0);
    for (const milestone of milestones)
      expect(milestone.evidenceRef).toMatch(/=\d+$/);
  });

  it("has no milestone that time alone could earn", () => {
    // Every branch reads a count of something verified or delayed. Nothing
    // here can be produced by leaving a tab open.
    const timeOnly = evidence({ activeDaysThisWeek: 0 });
    expect(awardMilestones(timeOnly, none, T0)).toEqual([]);
  });
});

describe("the reward surface is private and finite", () => {
  it("is marked private, so it can never become a ranking", () => {
    const sky = buildNightSky(
      awardMilestones(evidence({ verifiedPassages: 1 }), none, T0),
    );
    expect(sky.private).toBe(true);
  });

  it("is finite, so it is reachable rather than an infinite grind", () => {
    expect(buildNightSky([]).total).toBe(NIGHT_SKY_TOTAL);
    expect(NIGHT_SKY_TOTAL).toBeLessThan(200);
  });

  it("reveals one point per milestone earned", () => {
    const milestones = awardMilestones(
      evidence({ verifiedPassages: 1, helpRequests: 1 }),
      none,
      T0,
    );
    expect(buildNightSky(milestones).revealed).toHaveLength(milestones.length);
  });
});

describe("streaks are compassionate", () => {
  it("records a first day", () => {
    const { streak, message } = recordActivity(initialStreak, T0);
    expect(streak.currentDays).toBe(1);
    expect(message).toBe("First day recorded.");
  });

  it("counts consecutive days", () => {
    let streak = recordActivity(initialStreak, day(0)).streak;
    streak = recordActivity(streak, day(1)).streak;
    streak = recordActivity(streak, day(2)).streak;
    expect(streak.currentDays).toBe(3);
  });

  it("does not double-count the same day", () => {
    const first = recordActivity(initialStreak, T0).streak;
    const { streak, message } = recordActivity(first, T0 + 3600_000);
    expect(streak.currentDays).toBe(1);
    expect(message).toBe("Already recorded today.");
  });

  it("forgives a missed day inside the grace window", () => {
    let streak = recordActivity(initialStreak, day(0)).streak;
    streak = recordActivity(streak, day(1)).streak;
    // One day missed; the streak survives.
    streak = recordActivity(streak, day(3)).streak;
    expect(streak.currentDays).toBe(3);
    expect(streakParams.graceDays).toBe(1);
  });

  it("restarts after a longer absence, and says so without reproach", () => {
    let streak = recordActivity(initialStreak, day(0)).streak;
    streak = recordActivity(streak, day(1)).streak;
    const result = recordActivity(streak, day(10));
    expect(result.streak.currentDays).toBe(1);
    expect(result.message).toMatch(/Starting again/);
    expect(result.message).not.toMatch(/lost|broke|failed/i);
  });

  it("keeps the longest run after a restart", () => {
    let streak = recordActivity(initialStreak, day(0)).streak;
    streak = recordActivity(streak, day(1)).streak;
    streak = recordActivity(streak, day(2)).streak;
    streak = recordActivity(streak, day(20)).streak;
    expect(streak.currentDays).toBe(1);
    expect(streak.longestDays).toBe(3);
  });
});

describe("a pause protects a learner who cannot practise", () => {
  it("keeps the streak across a paused absence", () => {
    let streak = recordActivity(initialStreak, day(0)).streak;
    streak = pauseStreak(streak, { from: day(0), days: 14, reason: "illness" });
    streak = recordActivity(streak, day(10)).streak;
    expect(streak.currentDays).toBe(2);
  });

  it("clears the pause once the learner returns", () => {
    let streak = recordActivity(initialStreak, day(0)).streak;
    streak = pauseStreak(streak, { from: day(0), days: 14, reason: "travel" });
    streak = recordActivity(streak, day(5)).streak;
    expect(streak.pausedUntil).toBeNull();
    expect(streak.pauseReason).toBeNull();
  });

  it("refuses an indefinite pause, which would just be switching it off", () => {
    expect(() =>
      pauseStreak(initialStreak, { from: T0, days: 400, reason: "indefinite" }),
    ).toThrow(PauseTooLongError);
  });
});

describe("nothing shown about a streak is a threat", () => {
  it("says a pause is losing nothing", () => {
    const paused = pauseStreak(recordActivity(initialStreak, T0).streak, {
      from: T0,
      days: 7,
      reason: "exams",
    });
    expect(describeStreak(paused, day(2))).toMatch(/Nothing is being lost/);
  });

  it("reports no practice plainly", () => {
    expect(describeStreak(initialStreak, T0)).toBe("No practice recorded yet.");
  });

  it("never counts down to losing a streak", () => {
    let streak = recordActivity(initialStreak, day(0)).streak;
    streak = recordActivity(streak, day(1)).streak;
    const text = describeStreak(streak, day(1));
    expect(text).not.toMatch(/hours|expires|lose|losing|don't break/i);
  });
});
