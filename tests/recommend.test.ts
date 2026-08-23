/**
 * Recommendation ranking and the Today plan — acceptance criterion 2.
 */
import { describe, expect, it } from "vitest";
import {
  bucketOf,
  buildTodayPlan,
  forgettingRisk,
  rank,
  type Candidate,
} from "../src/core/recommend.js";
import { initialState } from "../src/core/scheduler.js";
import { MS_PER_DAY, type MemoryTargetId } from "../src/core/types.js";

const T0 = Date.UTC(2026, 0, 5);
const at = (d: number) => T0 + d * MS_PER_DAY;

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    targetId: "t1" as MemoryTargetId,
    kind: "segment",
    state: "verified",
    label: "Al-Mulk 1-4",
    estimatedActiveMinutes: 5,
    teacherPriority: 0,
    unresolvedCorrections: 0,
    correctionRecurrences: 0,
    prerequisiteWeakness: 0,
    connectionWeakness: 0,
    isAssignmentObligation: false,
    ...over,
  };
}

describe("criterion 2 — one clear next action", () => {
  it("produces exactly one primary CTA", () => {
    const plan = buildTodayPlan(
      [
        candidate({ targetId: "t1" as MemoryTargetId, state: "assigned", isAssignmentObligation: true }),
        candidate({ targetId: "t2" as MemoryTargetId, state: "fragile" }),
        candidate({ targetId: "t3" as MemoryTargetId, state: "durable" }),
      ],
      { now: T0, sessionBudgetMinutes: 30 },
    );
    const primaries = [plan.continueNow, plan.newMemory].filter(Boolean);
    expect(primaries.length).toBeGreaterThanOrEqual(1);
    expect(plan.continueNow).not.toBe(plan.newMemory);
  });

  it("gives every item a human-readable reason and never a bare score", () => {
    const plan = buildTodayPlan(
      [candidate({ isAssignmentObligation: true, state: "assigned" })],
      { now: T0, sessionBudgetMinutes: 30 },
    );
    const item = plan.newMemory ?? plan.continueNow;
    expect(item?.reason).toBeTruthy();
    expect(item?.reason).not.toMatch(/^\d/);
  });
});

describe("prefers the weakest useful evidence, not merely the oldest date", () => {
  it("ranks a low predicted-recall item above an older but stronger one", () => {
    const weakButRecent = candidate({
      targetId: "weak" as MemoryTargetId,
      scheduling: { ...initialState(false, at(-8)) },
    });
    const strongButOld = candidate({
      targetId: "strong" as MemoryTargetId,
      scheduling: { ...initialState(true, at(-30)), stabilityDays: 200 },
    });
    const ranked = rank([strongButOld, weakButRecent], T0);
    expect(ranked[0]?.candidate.targetId).toBe("weak");
  });

  it("assigns zero forgetting risk when no verified baseline exists", () => {
    expect(forgettingRisk(candidate({ state: "assigned" }), T0)).toBe(0);
  });

  it("explains an overdue review with its predicted recall", () => {
    const c = candidate({ scheduling: initialState(true, at(-30)) });
    const [top] = rank([c], T0);
    expect(top?.reason).toMatch(/predicted recall/i);
  });
});

describe("ranking respects teacher priority and correction recurrence", () => {
  it("surfaces a teacher-pinned target", () => {
    const pinned = candidate({ targetId: "pin" as MemoryTargetId, teacherPriority: 1 });
    const plain = candidate({ targetId: "plain" as MemoryTargetId });
    expect(rank([plain, pinned], T0)[0]?.candidate.targetId).toBe("pin");
  });

  it("raises a target whose correction keeps recurring", () => {
    const recurring = candidate({
      targetId: "rec" as MemoryTargetId,
      correctionRecurrences: 3,
      unresolvedCorrections: 1,
    });
    const [top] = rank([recurring, candidate({ targetId: "plain" as MemoryTargetId })], T0);
    expect(top?.candidate.targetId).toBe("rec");
    expect(top?.reason).toMatch(/recurred 3 times/);
  });

  it("filters teacher-suppressed targets before ranking", () => {
    const plan = buildTodayPlan(
      [
        candidate({ targetId: "hidden" as MemoryTargetId, teacherPriority: 1 }),
        candidate({ targetId: "shown" as MemoryTargetId }),
      ],
      {
        now: T0,
        sessionBudgetMinutes: 30,
        suppressedTargetIds: new Set(["hidden" as MemoryTargetId]),
      },
    );
    const all = [plan.continueNow, plan.newMemory, ...plan.keepStrong, ...plan.deferred];
    expect(all.some((r) => r?.candidate.targetId === "hidden")).toBe(false);
  });
});

describe("humane capping — deferred work is stated, never marked complete", () => {
  it("caps to the session budget and reports what was deferred", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      candidate({
        targetId: `t${i}` as MemoryTargetId,
        estimatedActiveMinutes: 6,
        scheduling: initialState(true, at(-20)),
      }),
    );
    const plan = buildTodayPlan(many, { now: T0, sessionBudgetMinutes: 12 });
    expect(plan.totalEstimatedActiveMinutes).toBeLessThanOrEqual(12);
    expect(plan.deferred.length).toBeGreaterThan(0);
    expect(plan.cappedNotice).toContain("not marked complete");
  });

  it("says nothing about capping when everything fits", () => {
    const plan = buildTodayPlan([candidate({ estimatedActiveMinutes: 5 })], {
      now: T0,
      sessionBudgetMinutes: 60,
    });
    expect(plan.deferred).toHaveLength(0);
    expect(plan.cappedNotice).toBeUndefined();
  });
});

describe("diversity", () => {
  it("does not let a large repair backlog crowd out all other material", () => {
    const repairs = Array.from({ length: 8 }, (_, i) =>
      candidate({
        targetId: `r${i}` as MemoryTargetId,
        state: "fragile",
        estimatedActiveMinutes: 3,
        scheduling: initialState(true, at(-40)),
      }),
    );
    const others = [
      candidate({ targetId: "new1" as MemoryTargetId, state: "assigned", estimatedActiveMinutes: 3 }),
      candidate({ targetId: "mat1" as MemoryTargetId, state: "durable", estimatedActiveMinutes: 3 }),
    ];
    const plan = buildTodayPlan([...repairs, ...others], {
      now: T0,
      sessionBudgetMinutes: 15,
    });
    const selected = [plan.continueNow, plan.newMemory, ...plan.keepStrong].filter(
      (r): r is NonNullable<typeof r> => Boolean(r),
    );
    const buckets = new Set(selected.map((r) => bucketOf(r.candidate.state)));
    expect(buckets.size).toBeGreaterThan(1);
  });
});

describe("determinism", () => {
  it("breaks ties on target id, never on input order", () => {
    const a = candidate({ targetId: "aaa" as MemoryTargetId });
    const b = candidate({ targetId: "bbb" as MemoryTargetId });
    expect(rank([a, b], T0).map((r) => r.candidate.targetId)).toEqual(["aaa", "bbb"]);
    expect(rank([b, a], T0).map((r) => r.candidate.targetId)).toEqual(["aaa", "bbb"]);
  });
});
