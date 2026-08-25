import { describe, expect, it } from "vitest";
import { reason } from "@/modules/memory/domain/types";
import type { HifzSessionPlan, PlannedStep } from "../domain/sessionPlan";
import {
  DEFAULT_STREAK_CONFIG,
  counted,
  goalStateOf,
  headlineOf,
  kidStepFor,
  kidStepIndex,
  nextStepAfter,
  rateOf,
  stepFor,
  streakOf,
  streamCounts,
  streamOf,
} from "./plan-shape";

const NOW = new Date("2026-08-23T09:00:00.000Z");

function step(partial: Partial<PlannedStep> = {}): PlannedStep {
  return {
    order: 1,
    unitId: "b:78:1",
    action: "review",
    exercise: "recall_first",
    estimatedMinutes: 1,
    reason: reason("memory.reason.due_review", { unitId: "b:78:1" }),
    priority: 450,
    isFirstAction: true,
    ...partial,
  };
}

function plan(steps: readonly PlannedStep[]): HifzSessionPlan {
  const first = steps[0];
  if (first === undefined) {
    return { kind: "empty", reason: "hifz.plan.nothing_due", budgetMinutes: 20, requestedBudgetMinutes: 20, withheld: [] };
  }
  return {
    kind: "plan",
    steps,
    firstAction: first,
    totalEstimatedMinutes: steps.length,
    budgetMinutes: 20,
    requestedBudgetMinutes: 20,
    newUnitsIncluded: 0,
    withheld: [],
  };
}

describe("the headline", () => {
  it("names exactly one primary action", () => {
    const headline = headlineOf(plan([step(), step({ unitId: "b:78:2", order: 2, isFirstAction: false })]));
    expect(headline.kind).toBe("action");
    if (headline.kind !== "action") throw new Error("expected an action");
    expect(headline.primary.unitId).toBe("b:78:1");
    expect(headline.remainingSteps).toBe(1);
  });

  it("carries the reason key through unchanged, never a rewritten sentence", () => {
    const headline = headlineOf(plan([step()]));
    if (headline.kind !== "action") throw new Error("expected an action");
    expect(headline.primary.reason.key).toBe("memory.reason.due_review");
  });

  it("reports no remaining steps for a one-step session", () => {
    const headline = headlineOf(plan([step()]));
    if (headline.kind !== "action") throw new Error("expected an action");
    expect(headline.remainingSteps).toBe(0);
  });

  it("says nothing is due, with the reason, rather than inventing work", () => {
    const headline = headlineOf(plan([]));
    expect(headline).toEqual({
      kind: "nothing_due",
      reasonKey: "hifz.plan.nothing_due",
      offersMaintenance: false,
    });
  });

  it("tells 'nothing due' apart from 'nothing fits'", () => {
    const headline = headlineOf({
      kind: "empty",
      reason: "hifz.plan.budget_too_small",
      budgetMinutes: 1,
      requestedBudgetMinutes: 1,
      withheld: [],
    });
    if (headline.kind !== "nothing_due") throw new Error("expected an empty plan");
    expect(headline.reasonKey).toBe("hifz.plan.budget_too_small");
  });

  it("offers maintenance reading when there is something to read", () => {
    const headline = headlineOf(plan([]), { canReadForMaintenance: true });
    if (headline.kind !== "nothing_due") throw new Error("expected an empty plan");
    expect(headline.offersMaintenance).toBe(true);
  });
});

describe("counts", () => {
  it("keeps its denominator", () => {
    expect(counted(3, 7)).toEqual({ done: 3, total: 7, hasDenominator: true });
  });

  it("reports no denominator rather than 0 of 0", () => {
    const value = counted(0, 0);
    expect(value.hasDenominator).toBe(false);
    expect(rateOf(value)).toBeNull();
  });

  it("never claims more done than the total", () => {
    expect(counted(9, 4).done).toBe(4);
  });

  it("refuses nonsense numbers instead of propagating them", () => {
    expect(counted(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
      done: 0,
      total: 0,
      hasDenominator: false,
    });
  });

  it("computes a rate only when there is one to compute", () => {
    expect(rateOf(counted(1, 4))).toBe(0.25);
  });
});

describe("the adult's three streams", () => {
  it("calls new material new", () => {
    expect(streamOf({ unitId: "b:78:9", action: "learn_new", stabilityDays: null })).toBe("new");
  });

  it("calls an unrecorded unit new even when the action is a review", () => {
    expect(streamOf({ unitId: "b:78:9", action: "review", stabilityDays: null })).toBe("new");
  });

  it("calls a consolidating unit recent", () => {
    expect(streamOf({ unitId: "b:78:1", action: "review", stabilityDays: 5 })).toBe("recent");
  });

  it("calls a long-held unit old", () => {
    expect(streamOf({ unitId: "b:2:255", action: "review", stabilityDays: 200 })).toBe("old");
  });

  it("puts the boundary itself in the old stream", () => {
    expect(streamOf({ unitId: "b:2:255", action: "review", stabilityDays: 21 })).toBe("old");
  });

  it("counts all three streams", () => {
    expect(
      streamCounts([
        { unitId: "a", action: "learn_new", stabilityDays: null },
        { unitId: "b", action: "review", stabilityDays: 3 },
        { unitId: "c", action: "review", stabilityDays: 90 },
        { unitId: "d", action: "review", stabilityDays: 90 },
      ]),
    ).toEqual({ new: 1, recent: 1, old: 2 });
  });

  it("counts nothing as nothing", () => {
    expect(streamCounts([])).toEqual({ new: 0, recent: 0, old: 0 });
  });
});

describe("the kids' three steps", () => {
  it("puts every middle rung behind the build door", () => {
    for (const exercise of ["recall_first", "rebuild", "gap_fill", "next_ayah_cue", "connect_chain"] as const) {
      expect(kidStepFor(exercise)).toBe("rebuild");
    }
  });

  it("keeps listening and saying it as their own doors", () => {
    expect(kidStepFor("listen")).toBe("listen");
    expect(kidStepFor("oral_recitation")).toBe("oral_recitation");
  });

  it("orders the three doors listen → build → say it", () => {
    expect([kidStepIndex("listen"), kidStepIndex("rebuild"), kidStepIndex("oral_recitation")]).toEqual([0, 1, 2]);
  });
});

describe("the streak, with grace", () => {
  const day = (offset: number) => new Date(NOW.getTime() - offset * 86_400_000);

  it("counts consecutive days", () => {
    expect(streakOf([day(0), day(1), day(2)], NOW).days).toBe(3);
  });

  it("does not punish a day that has not happened yet", () => {
    const streak = streakOf([day(1), day(2)], NOW);
    expect(streak.days).toBe(2);
    expect(streak.restingToday).toBe(true);
    expect(streak.graceUsed).toBe(0);
  });

  it("forgives one missed day rather than breaking the chain", () => {
    const streak = streakOf([day(0), day(2), day(3)], NOW);
    expect(streak.days).toBe(3);
    expect(streak.graceUsed).toBe(1);
    expect(streak.graceRemaining).toBe(0);
  });

  it("stops at the second missed day, without a red mark", () => {
    const streak = streakOf([day(0), day(2), day(4), day(5)], NOW);
    expect(streak.days).toBe(2);
    expect(streak.graceUsed).toBe(1);
  });

  it("reports an empty history as zero, not as a broken streak", () => {
    expect(streakOf([], NOW)).toEqual({ days: 0, graceUsed: 0, graceRemaining: 1, restingToday: true });
  });

  it("collapses several attempts on one day into one day", () => {
    expect(streakOf([day(0), day(0), day(0)], NOW).days).toBe(1);
  });

  it("ignores days in the future rather than trusting a bad clock", () => {
    expect(streakOf([new Date(NOW.getTime() + 5 * 86_400_000)], NOW).days).toBe(0);
  });

  it("ignores days beyond the window", () => {
    expect(streakOf([day(DEFAULT_STREAK_CONFIG.windowDays + 10)], NOW).days).toBe(0);
  });

  it("honours a larger grace allowance", () => {
    const streak = streakOf([day(0), day(3)], NOW, { graceDays: 2, windowDays: 60 });
    expect(streak.days).toBe(2);
    expect(streak.graceUsed).toBe(2);
  });
});

describe("the goal", () => {
  it("treats a goal of zero as unset, not as met", () => {
    expect(goalStateOf(0, 0)).toEqual({ kind: "not_set" });
  });

  it("carries the denominator when it is set", () => {
    const goal = goalStateOf(5, 2);
    if (goal.kind !== "set") throw new Error("expected a goal");
    expect(goal.progress).toEqual({ done: 2, total: 5, hasDenominator: true });
    expect(goal.met).toBe(false);
  });

  it("is met when the work is done", () => {
    const goal = goalStateOf(3, 3);
    if (goal.kind !== "set") throw new Error("expected a goal");
    expect(goal.met).toBe(true);
  });
});

describe("finding a step", () => {
  it("finds a step by unit id", () => {
    expect(stepFor(plan([step()]), "b:78:1")?.exercise).toBe("recall_first");
  });

  it("returns null for a unit that is not in the plan", () => {
    expect(stepFor(plan([step()]), "b:2:255")).toBeNull();
  });

  it("returns null for every unit of an empty plan", () => {
    expect(stepFor(plan([]), "b:78:1")).toBeNull();
  });

  it("finds what comes next", () => {
    const two = plan([step(), step({ unitId: "b:78:2", order: 2, isFirstAction: false })]);
    expect(nextStepAfter(two, "b:78:1")?.unitId).toBe("b:78:2");
  });

  it("reports the end of the session as null", () => {
    expect(nextStepAfter(plan([step()]), "b:78:1")).toBeNull();
  });
});
