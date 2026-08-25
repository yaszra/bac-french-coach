import { describe, expect, it } from "vitest";

import { emptyState } from "./fsrs";
import {
  ACTION_BAND,
  DEFAULT_TIER_POLICIES,
  planSession,
  recommend,
  type NewUnitCandidate,
  type PolicyInput,
  type Recommendation,
  type RecommendedAction,
} from "./policy";
import { addDays } from "./time";
import type { MemoryState, UnitKind } from "./types";

const NOW = new Date("2026-06-01T09:00:00.000Z");

function state(
  unitId: string,
  kind: UnitKind,
  stability: number,
  reviewedDaysAgo: number,
  overrides: Partial<MemoryState> = {},
): MemoryState {
  return {
    ...emptyState(unitId, kind),
    stability,
    reps: 4,
    confidence: 0.7,
    lastReviewAt: addDays(NOW, -reviewedDaysAgo),
    lastRetrievalType: "recall_first",
    ...overrides,
  };
}

function newCandidates(count: number, from = 400): readonly NewUnitCandidate[] {
  return Array.from({ length: count }, (_unused, index) => ({
    unitId: `b:2:${from + index}`,
    kind: "ayah_body" as UnitKind,
    order: index,
  }));
}

/** A day containing one of every kind of work. */
function fullBoard(): PolicyInput {
  return {
    now: NOW,
    tier: "adult",
    states: [
      state("b:2:255", "ayah_body", 5, 20), // due, weakest recall
      state("b:2:300", "ayah_body", 5, 8), // due, stronger recall
      state("b:2:256", "ayah_body", 40, 1), // strong body
      state("b:2:257", "ayah_body", 40, 1), // strong body
      state("t:2:256>2:257", "ayah_transition", 10, 9.5), // weak join, not yet due
      state("b:2:258", "ayah_body", 1, 1), // lapsed yesterday
      state("b:2:259", "ayah_body", 30, 2), // awaiting the teacher's ear
    ],
    verificationRequests: [
      { unitId: "b:2:259", requestedAt: addDays(NOW, -5), dueAt: addDays(NOW, -3) },
    ],
    recentLapses: [{ unitId: "b:2:258", occurredAt: addDays(NOW, -1) }],
    newCandidates: newCandidates(6),
    maintenance: [{ unitId: "p:604:1", kind: "page_position", lastReadAt: addDays(NOW, -40) }],
  };
}

function firstIndexOf(list: readonly Recommendation[], action: RecommendedAction): number {
  return list.findIndex((item) => item.action === action);
}

describe("precedence", () => {
  it("orders the bands: verify, repair, review, join, new, maintenance", () => {
    const plan = planSession(fullBoard());
    const order: readonly RecommendedAction[] = [
      "verify_with_teacher",
      "repair_drill",
      "review",
      "strengthen_join",
      "learn_new",
      "maintenance_reading",
    ];
    const positions = order.map((action) => firstIndexOf(plan.recommendations, action));
    for (const position of positions) expect(position).toBeGreaterThanOrEqual(0);
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index] ?? -1).toBeGreaterThan(positions[index - 1] ?? -1);
    }
  });

  it("never lets urgency inside one band overtake the band above it", () => {
    const plan = planSession(fullBoard());
    for (const left of plan.recommendations) {
      for (const right of plan.recommendations) {
        if (ACTION_BAND[left.action] > ACTION_BAND[right.action]) {
          expect(left.priority).toBeGreaterThan(right.priority);
        }
      }
    }
  });

  it("ranks due reviews by lowest retrievability first", () => {
    const plan = planSession(fullBoard());
    const reviews = plan.recommendations.filter((item) => item.action === "review");
    expect(reviews.map((item) => item.unitId)).toEqual(["b:2:255", "b:2:300"]);
  });

  it("claims each unit once, in its highest band", () => {
    const plan = planSession(fullBoard());
    const ids = plan.recommendations.map((item) => item.unitId);
    expect(new Set(ids).size).toBe(ids.length);
    const lapsed = plan.recommendations.find((item) => item.unitId === "b:2:258");
    expect(lapsed?.action).toBe("repair_drill");
  });

  it("returns the same ranked list from recommend() as from planSession()", () => {
    expect(recommend(fullBoard())).toEqual(planSession(fullBoard()).recommendations);
  });
});

describe("reasons", () => {
  it("gives every recommendation a machine-readable reason with parameters", () => {
    for (const item of planSession(fullBoard()).recommendations) {
      expect(item.reason.key).toMatch(/^memory\.reason\.[a-z0-9_]+$/);
      expect(Object.keys(item.reason.params).length).toBeGreaterThan(0);
      expect(item.reason.params.unitId).toBe(item.unitId);
    }
  });

  it("names the specific reason for each band", () => {
    const byAction = new Map(
      planSession(fullBoard()).recommendations.map((item) => [item.action, item.reason.key]),
    );
    expect(byAction.get("verify_with_teacher")).toBe("memory.reason.verification_overdue");
    expect(byAction.get("repair_drill")).toBe("memory.reason.recent_lapse");
    expect(byAction.get("review")).toBe("memory.reason.due_review");
    expect(byAction.get("strengthen_join")).toBe("memory.reason.weak_join");
    expect(byAction.get("learn_new")).toBe("memory.reason.new_material");
    expect(byAction.get("maintenance_reading")).toBe("memory.reason.maintenance_due");
  });
});

describe("weak joins", () => {
  it("flags a transition weaker than both āyāt it joins", () => {
    const plan = planSession(fullBoard());
    const join = plan.recommendations.find((item) => item.action === "strengthen_join");
    expect(join?.unitId).toBe("t:2:256>2:257");
    expect(join?.retrievalType).toBe("connect_chain");
    expect(plan.load.weakJoinCount).toBe(1);
  });

  it("leaves a join alone when it is as strong as its āyāt", () => {
    const input: PolicyInput = {
      now: NOW,
      tier: "adult",
      states: [
        state("b:2:256", "ayah_body", 40, 1),
        state("b:2:257", "ayah_body", 40, 1),
        state("t:2:256>2:257", "ayah_transition", 60, 1),
      ],
    };
    expect(planSession(input).load.weakJoinCount).toBe(0);
  });

  it("needs evidence on both āyāt before judging the join", () => {
    const input: PolicyInput = {
      now: NOW,
      tier: "adult",
      states: [
        state("b:2:256", "ayah_body", 40, 1),
        state("t:2:256>2:257", "ayah_transition", 10, 9.5),
      ],
    };
    expect(planSession(input).load.weakJoinCount).toBe(0);
  });
});

describe("new material budget", () => {
  it("proposes new units on a light day, up to what the budget affords", () => {
    const plan = planSession(fullBoard());
    expect(plan.load.newWithheld).toBe(false);
    expect(plan.load.newWithheldReason).toBeNull();
    expect(plan.load.newUnitsProposed).toBe(5);
    expect(plan.recommendations.filter((item) => item.action === "learn_new")).toHaveLength(5);
  });

  it("withholds new material when the due load fills the day, and says why", () => {
    const heavy: PolicyInput = {
      now: NOW,
      tier: "adult",
      states: Array.from({ length: 30 }, (_unused, index) =>
        state(`b:3:${index + 1}`, "ayah_body", 4, 10),
      ),
      newCandidates: newCandidates(6),
    };
    const plan = planSession(heavy);
    expect(plan.load.dueReviewCount).toBe(30);
    expect(plan.load.dueLoadMinutes).toBeGreaterThanOrEqual(plan.load.newMaterialBudgetMinutes);
    expect(plan.load.newWithheld).toBe(true);
    expect(plan.load.newWithheldReason?.key).toBe("memory.reason.new_material_withheld_load");
    expect(plan.recommendations.some((item) => item.action === "learn_new")).toBe(false);
  });

  it("caps new units at the tier maximum on an empty day", () => {
    const idle: PolicyInput = {
      now: NOW,
      tier: "kids",
      states: [],
      newCandidates: newCandidates(20),
    };
    const plan = planSession(idle);
    expect(plan.load.newUnitsProposed).toBe(DEFAULT_TIER_POLICIES.kids.maxNewUnitsPerSession);
  });

  it("never re-proposes a unit that already carries evidence", () => {
    const input: PolicyInput = {
      now: NOW,
      tier: "adult",
      states: [state("b:2:400", "ayah_body", 40, 1)],
      newCandidates: newCandidates(3),
    };
    const proposed = planSession(input)
      .recommendations.filter((item) => item.action === "learn_new")
      .map((item) => item.unitId);
    expect(proposed).not.toContain("b:2:400");
  });

  it("respects a tier that admits no new material at all", () => {
    const input: PolicyInput = {
      now: NOW,
      tier: "kids",
      states: [],
      newCandidates: newCandidates(3),
      tierPolicy: { ...DEFAULT_TIER_POLICIES.kids, maxNewUnitsPerSession: 0 },
    };
    const plan = planSession(input);
    expect(plan.load.newWithheld).toBe(true);
    expect(plan.load.newWithheldReason?.key).toBe("memory.reason.new_material_withheld_tier");
  });
});

describe("windows and gates", () => {
  it("ignores a verification request that is not yet overdue", () => {
    const input: PolicyInput = {
      now: NOW,
      tier: "adult",
      states: [state("b:2:259", "ayah_body", 30, 2)],
      verificationRequests: [
        { unitId: "b:2:259", requestedAt: addDays(NOW, -1), dueAt: addDays(NOW, 2) },
      ],
    };
    expect(planSession(input).load.verificationCount).toBe(0);
  });

  it("derives the overdue date from the tier grace period when none is given", () => {
    const input: PolicyInput = {
      now: NOW,
      tier: "adult",
      states: [state("b:2:259", "ayah_body", 30, 2)],
      verificationRequests: [{ unitId: "b:2:259", requestedAt: addDays(NOW, -10) }],
    };
    expect(planSession(input).load.verificationCount).toBe(1);
  });

  it("stops proposing repair drills once the lapse falls outside the window", () => {
    const stale: PolicyInput = {
      now: NOW,
      tier: "adult",
      states: [state("b:2:258", "ayah_body", 30, 20)],
      recentLapses: [{ unitId: "b:2:258", occurredAt: addDays(NOW, -20) }],
    };
    expect(planSession(stale).load.repairCount).toBe(0);
  });

  it("offers maintenance only after the tier's interval has passed", () => {
    const recent: PolicyInput = {
      now: NOW,
      tier: "adult",
      states: [],
      maintenance: [{ unitId: "p:604:1", kind: "page_position", lastReadAt: addDays(NOW, -3) }],
    };
    expect(planSession(recent).recommendations).toHaveLength(0);

    const never: PolicyInput = {
      now: NOW,
      tier: "adult",
      states: [],
      maintenance: [{ unitId: "p:604:1", kind: "page_position", lastReadAt: null }],
    };
    const plan = planSession(never);
    expect(plan.recommendations[0]?.reason.key).toBe("memory.reason.maintenance_never_read");
  });
});

describe("session selection", () => {
  it("keeps the selected work inside the tier budget", () => {
    const plan = planSession(fullBoard());
    const minutes = plan.selected.reduce((total, item) => total + item.estimatedMinutes, 0);
    expect(minutes).toBeLessThanOrEqual(plan.load.budgetMinutes);
    expect(plan.selected.length).toBeLessThan(plan.recommendations.length);
  });

  it("always leaves one obvious next action, even on an over-budget day", () => {
    const input: PolicyInput = {
      ...fullBoard(),
      tierPolicy: { ...DEFAULT_TIER_POLICIES.adult, sessionBudgetMinutes: 0.5 },
    };
    const plan = planSession(input);
    expect(plan.selected).toHaveLength(1);
    expect(plan.selected[0]?.action).toBe("verify_with_teacher");
  });

  it("gives a kid a shorter session than an adult on the same board", () => {
    const board = fullBoard();
    const kids = planSession({ ...board, tier: "kids" });
    const adults = planSession({ ...board, tier: "adult" });
    const minutes = (plan: ReturnType<typeof planSession>): number =>
      plan.selected.reduce((total, item) => total + item.estimatedMinutes, 0);
    expect(minutes(kids)).toBeLessThan(minutes(adults));
    expect(kids.load.budgetMinutes).toBeLessThan(adults.load.budgetMinutes);
  });

  it("returns nothing at all when there is nothing to do", () => {
    const plan = planSession({ now: NOW, tier: "adult", states: [] });
    expect(plan.recommendations).toEqual([]);
    expect(plan.selected).toEqual([]);
    expect(plan.load.newWithheld).toBe(false);
  });
});
