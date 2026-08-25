import { describe, expect, it } from "vitest";
import { planSession as rankRecommendations } from "@/modules/memory/domain/policy";
import type { Recommendation } from "@/modules/memory/domain/policy";
import { reason, type MemoryState } from "@/modules/memory/domain/types";
import { KIDS_SESSION_CEILING_MINUTES, exercisesInPlan, planSession } from "./sessionPlan";

const now = new Date("2026-03-01T09:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

const rec = (over: Partial<Recommendation> = {}): Recommendation => ({
  action: "review",
  unitId: "b:2:1",
  reason: reason("memory.reason.due_review", { unitId: "b:2:1" }),
  priority: 400,
  estimatedMinutes: 1,
  retrievalType: "recall_first",
  ...over,
});

const reviews = (count: number, minutes = 1): readonly Recommendation[] =>
  Array.from({ length: count }, (_unused, index) =>
    rec({ unitId: `b:2:${index + 1}`, priority: 400 + count - index, estimatedMinutes: minutes }),
  );

const state = (unitId: string, over: Partial<MemoryState> = {}): MemoryState => ({
  unitId,
  kind: "ayah_body",
  stability: 1,
  difficulty: 5,
  reps: 1,
  lapses: 0,
  lastReviewAt: new Date(now.getTime() - 3_600_000),
  lastRetrievalType: "listen",
  confidence: 0.1,
  ...over,
});

describe("the kids' ceiling", () => {
  it("never plans more than ten minutes for a child, whatever budget is passed", () => {
    const plan = planSession({
      recommendations: reviews(40),
      tierBudgetMinutes: 45,
      maxNewUnits: 2,
      tier: "kids",
    });
    expect(plan.kind).toBe("plan");
    if (plan.kind !== "plan") return;
    expect(plan.budgetMinutes).toBe(KIDS_SESSION_CEILING_MINUTES);
    expect(plan.requestedBudgetMinutes).toBe(45);
    expect(plan.totalEstimatedMinutes).toBeLessThanOrEqual(KIDS_SESSION_CEILING_MINUTES);
    expect(plan.steps).toHaveLength(10);
  });

  it("applies a ceiling even when the tier is unknown", () => {
    const plan = planSession({
      recommendations: reviews(200),
      tierBudgetMinutes: 600,
      maxNewUnits: 0,
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan.budgetMinutes).toBe(60);
    expect(plan.totalEstimatedMinutes).toBeLessThanOrEqual(60);
  });
});

describe("an empty plan is a real plan", () => {
  it("says nothing is due, and invents no work", () => {
    const plan = planSession({
      recommendations: [],
      tierBudgetMinutes: 10,
      maxNewUnits: 2,
      tier: "kids",
    });
    expect(plan).toEqual({
      kind: "empty",
      reason: "hifz.plan.nothing_due",
      budgetMinutes: 10,
      requestedBudgetMinutes: 10,
      withheld: [],
    });
  });

  it("tells a session that does not fit apart from a day with nothing due", () => {
    const plan = planSession({
      recommendations: [rec({ estimatedMinutes: 3 })],
      tierBudgetMinutes: 2,
      maxNewUnits: 0,
      tier: "kids",
    });
    expect(plan.kind).toBe("empty");
    if (plan.kind !== "empty") return;
    expect(plan.reason).toBe("hifz.plan.budget_too_small");
    expect(plan.withheld).toHaveLength(1);
    expect(plan.withheld[0]?.reason).toBe("hifz.plan.budget_spent");
  });
});

describe("new material is the first thing to go", () => {
  it("withholds new āyāt once the budget is spent", () => {
    const plan = planSession({
      recommendations: [
        ...reviews(10),
        rec({
          action: "learn_new",
          unitId: "b:2:99",
          priority: 200,
          estimatedMinutes: 3,
          retrievalType: "listen",
        }),
      ],
      tierBudgetMinutes: 10,
      maxNewUnits: 2,
      tier: "kids",
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan.newUnitsIncluded).toBe(0);
    expect(plan.withheld.map((item) => item.reason)).toEqual(["hifz.plan.budget_spent"]);
    expect(plan.steps.every((step) => step.action === "review")).toBe(true);
  });

  it("caps how much new material a session may open", () => {
    const newUnits = [1, 2, 3].map((index) =>
      rec({
        action: "learn_new",
        unitId: `b:2:${index}`,
        priority: 200 - index,
        estimatedMinutes: 2,
        retrievalType: "listen",
      }),
    );
    const plan = planSession({
      recommendations: newUnits,
      tierBudgetMinutes: 30,
      maxNewUnits: 1,
      tier: "teen",
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan.newUnitsIncluded).toBe(1);
    expect(plan.withheld.map((item) => item.reason)).toEqual([
      "hifz.plan.new_capped",
      "hifz.plan.new_capped",
    ]);
  });
});

describe("one obvious next action", () => {
  it("names the highest-priority step as the first action", () => {
    const plan = planSession({
      recommendations: [
        rec({ unitId: "b:2:5", priority: 401 }),
        rec({ action: "verify_with_teacher", unitId: "b:2:9", priority: 650, estimatedMinutes: 3 }),
      ],
      tierBudgetMinutes: 20,
      maxNewUnits: 1,
      tier: "teen",
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan.firstAction.unitId).toBe("b:2:9");
    expect(plan.firstAction.isFirstAction).toBe(true);
    expect(plan.firstAction.order).toBe(1);
    expect(plan.steps.slice(1).every((step) => !step.isFirstAction)).toBe(true);
  });

  it("carries the policy's reason through untouched", () => {
    const recommendation = rec();
    const plan = planSession({
      recommendations: [recommendation],
      tierBudgetMinutes: 10,
      maxNewUnits: 0,
      tier: "kids",
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan.firstAction.reason).toBe(recommendation.reason);
  });
});

describe("rungs are chosen for the learner, not for the action", () => {
  it("clamps a machine exercise to what the learner's evidence supports", () => {
    const plan = planSession({
      recommendations: [
        rec({
          action: "strengthen_join",
          unitId: "t:2:1>2:2",
          priority: 350,
          retrievalType: "connect_chain",
        }),
      ],
      tierBudgetMinutes: 20,
      maxNewUnits: 0,
      tier: "teen",
      states: [state("t:2:1>2:2", { kind: "ayah_transition" })],
      now,
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan.firstAction.exercise).not.toBe("connect_chain");
    expect(["listen", "recall_first", "rebuild", "gap_fill"]).toContain(
      plan.firstAction.exercise,
    );
  });

  it("never clamps the teacher's ear", () => {
    const plan = planSession({
      recommendations: [
        rec({
          action: "verify_with_teacher",
          unitId: "b:2:1",
          priority: 650,
          estimatedMinutes: 3,
          retrievalType: "oral_recitation",
        }),
      ],
      tierBudgetMinutes: 20,
      maxNewUnits: 0,
      tier: "teen",
      states: [state("b:2:1")],
      now,
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan.firstAction.exercise).toBe("oral_recitation");
  });

  it("leaves the rung alone when the learner's state is unknown", () => {
    const plan = planSession({
      recommendations: [rec({ action: "strengthen_join", retrievalType: "connect_chain" })],
      tierBudgetMinutes: 20,
      maxNewUnits: 0,
      tier: "teen",
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan.firstAction.exercise).toBe("connect_chain");
  });
});

describe("costing", () => {
  it("takes a flat per-exercise cost when one is given", () => {
    const plan = planSession({
      recommendations: reviews(20),
      tierBudgetMinutes: 10,
      estimatedMinutesPerExercise: 2,
      maxNewUnits: 0,
      tier: "kids",
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan.steps).toHaveLength(5);
    expect(plan.totalEstimatedMinutes).toBe(10);
  });

  it("takes a per-rung table when one is given", () => {
    const plan = planSession({
      recommendations: reviews(20),
      tierBudgetMinutes: 10,
      estimatedMinutesPerExercise: { recall_first: 5 },
      maxNewUnits: 0,
      tier: "kids",
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan.steps).toHaveLength(2);
  });

  it("lists the rungs a session touches, weakest first", () => {
    const plan = planSession({
      recommendations: [
        rec({ action: "learn_new", unitId: "b:2:7", priority: 200, retrievalType: "listen" }),
        rec({ unitId: "b:2:8", priority: 410, retrievalType: "recall_first" }),
      ],
      tierBudgetMinutes: 20,
      maxNewUnits: 2,
      tier: "teen",
    });
    expect(exercisesInPlan(plan)).toEqual(["listen", "recall_first"]);
  });
});

describe("with the memory engine's own recommendations", () => {
  it("turns a ranked board into a session inside the child's ceiling", () => {
    const due = [
      state("b:2:1", { stability: 1, lastReviewAt: daysAgo(6), reps: 3, confidence: 0.5 }),
      state("b:2:2", { stability: 1, lastReviewAt: daysAgo(9), reps: 4, confidence: 0.6 }),
    ];
    const board = rankRecommendations({
      now,
      tier: "kids",
      states: due,
      newCandidates: [{ unitId: "b:2:3", kind: "ayah_body", order: 1 }],
    });
    expect(board.recommendations.length).toBeGreaterThan(0);

    const plan = planSession({
      recommendations: board.recommendations,
      tierBudgetMinutes: 10,
      maxNewUnits: 2,
      tier: "kids",
      states: due,
      now,
    });
    if (plan.kind !== "plan") throw new Error("expected a plan");
    expect(plan.totalEstimatedMinutes).toBeLessThanOrEqual(KIDS_SESSION_CEILING_MINUTES);
    expect(plan.firstAction.action).toBe("review");
    expect(plan.steps.map((step) => step.order)).toEqual(
      plan.steps.map((_unused, index) => index + 1),
    );
  });
});
