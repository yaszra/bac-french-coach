import { describe, expect, it } from "vitest";
import { emptyState } from "@/modules/memory/domain/fsrs";
import type { MemoryState } from "@/modules/memory/domain/types";
import { masteryOf, summariseMastery } from "./mastery";
import type { HumanVerdict } from "./stateMachine";

const unitId = "b:2:255";
const now = new Date("2026-03-01T09:00:00Z");

const state = (over: Partial<MemoryState> = {}): MemoryState => ({
  unitId,
  kind: "ayah_body",
  stability: 40,
  difficulty: 5,
  reps: 6,
  lapses: 1,
  lastReviewAt: new Date("2026-02-28T09:00:00Z"),
  lastRetrievalType: "recall_first",
  confidence: 0.8,
  ...over,
});

const verdict = (over: Partial<HumanVerdict> = {}): HumanVerdict => ({
  unitId,
  outcome: "verified",
  at: new Date("2026-02-20T09:00:00Z"),
  verifiedBy: "user_teacher_1",
  ...over,
});

describe("masteryOf — nothing recorded", () => {
  it("returns not_yet_recorded rather than zero", () => {
    const mastery = masteryOf(unitId, null, [], { now });
    expect(mastery.level).toBe("not_yet_recorded");
    expect(mastery.verifiedAt).toBeNull();
    expect(mastery.retrievability).toBeNull();
    expect(mastery.reason).toBe("hifz.mastery.not_yet_recorded");
  });

  it("says the same for an empty memory state as for no state at all", () => {
    const fresh = emptyState(unitId, "ayah_body");
    expect(masteryOf(unitId, fresh, [], { now }).level).toBe("not_yet_recorded");
  });

  it("never reports a rate without a denominator", () => {
    const mastery = masteryOf(unitId, null, [], { now });
    expect(mastery.denominator).toEqual({ reviews: 0, verifications: 0 });
    expect(mastery.retention).toEqual({ numerator: 0, denominator: 0, rate: null });
    expect(mastery.verification).toEqual({ numerator: 0, denominator: 0, rate: null });
  });
});

describe("masteryOf — the ear gates everything above learning", () => {
  it("keeps a strongly scheduled unit at learning until a person listens", () => {
    const mastery = masteryOf(unitId, state({ stability: 400, reps: 30, lapses: 0 }), [], { now });
    expect(mastery.level).toBe("learning");
    expect(mastery.reason).toBe("hifz.mastery.awaiting_first_verification");
    expect(mastery.denominator.reviews).toBe(30);
  });

  it("reports held once a person has confirmed it and the memory still holds", () => {
    const mastery = masteryOf(unitId, state(), [verdict()], { now });
    expect(mastery.level).toBe("held");
    expect(mastery.verifiedAt).toEqual(verdict().at);
    expect(mastery.denominator).toEqual({ reviews: 6, verifications: 1 });
  });

  it("reports maintained only after a second ear over a long interval", () => {
    const verdicts = [
      verdict({ at: new Date("2025-11-01T09:00:00Z") }),
      verdict({ at: new Date("2026-02-01T09:00:00Z") }),
    ];
    const mastery = masteryOf(unitId, state({ stability: 120, reps: 20 }), verdicts, { now });
    expect(mastery.level).toBe("maintained");
    expect(mastery.denominator.verifications).toBe(2);
  });

  it("demotes to learning when a later verdict says there is work to do", () => {
    const verdicts = [
      verdict({ at: new Date("2026-01-01T09:00:00Z") }),
      verdict({ outcome: "needs_work", at: new Date("2026-02-01T09:00:00Z") }),
    ];
    const mastery = masteryOf(unitId, state(), verdicts, { now });
    expect(mastery.level).toBe("learning");
    expect(mastery.reason).toBe("hifz.mastery.needs_work_since_verification");
  });

  it("demotes to learning when the unit lapsed after being confirmed", () => {
    const mastery = masteryOf(unitId, state(), [verdict()], {
      now,
      lastLapseAt: new Date("2026-02-25T09:00:00Z"),
    });
    expect(mastery.level).toBe("learning");
    expect(mastery.reason).toBe("hifz.mastery.lapsed_since_verification");
  });

  it("demotes to learning when recall has fallen away since the verification", () => {
    const stale = state({ stability: 3, lastReviewAt: new Date("2026-01-01T09:00:00Z") });
    const mastery = masteryOf(unitId, stale, [verdict()], { now });
    expect(mastery.level).toBe("learning");
    expect(mastery.reason).toBe("hifz.mastery.recall_below_hold");
    expect(mastery.retrievability).not.toBeNull();
  });
});

describe("masteryOf — denominators and hygiene", () => {
  it("carries retention with its denominator", () => {
    const mastery = masteryOf(unitId, state({ reps: 10, lapses: 2 }), [verdict()], { now });
    expect(mastery.retention).toEqual({ numerator: 8, denominator: 10, rate: 0.8 });
  });

  it("counts only verdicts that were actually heard", () => {
    const verdicts = [verdict(), verdict({ outcome: "not_heard", at: new Date("2026-02-25T09:00:00Z") })];
    const mastery = masteryOf(unitId, state(), verdicts, { now });
    expect(mastery.denominator.verifications).toBe(1);
    expect(mastery.verification).toEqual({ numerator: 1, denominator: 1, rate: 1 });
  });

  it("ignores verdicts belonging to another unit", () => {
    const other = verdict({ unitId: "b:2:256" });
    const mastery = masteryOf(unitId, state(), [other], { now });
    expect(mastery.level).toBe("learning");
    expect(mastery.denominator.verifications).toBe(0);
  });

  it("ignores a memory state belonging to another unit", () => {
    const mastery = masteryOf(unitId, state({ unitId: "b:2:256" }), [], { now });
    expect(mastery.level).toBe("not_yet_recorded");
  });

  it("judges as of the last recorded evidence when no moment is given", () => {
    const mastery = masteryOf(unitId, state(), [verdict()]);
    expect(mastery.asOf).toEqual(state().lastReviewAt);
    expect(mastery.level).toBe("held");
  });
});

describe("summariseMastery", () => {
  it("keeps unstarted units out of the confirmed denominator", () => {
    const summary = summariseMastery([
      masteryOf("b:2:1", null, [], { now }),
      masteryOf("b:2:2", state({ unitId: "b:2:2" }), [], { now }),
      masteryOf("b:2:3", state({ unitId: "b:2:3" }), [verdict({ unitId: "b:2:3" })], { now }),
    ]);
    expect(summary.counts).toEqual({
      not_yet_recorded: 1,
      learning: 1,
      held: 1,
      maintained: 0,
    });
    expect(summary.confirmed).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(summary.recorded).toEqual({ numerator: 2, denominator: 3, rate: 2 / 3 });
  });

  it("returns a null rate for a page nobody has started", () => {
    const summary = summariseMastery([
      masteryOf("b:2:1", null, [], { now }),
      masteryOf("b:2:2", null, [], { now }),
    ]);
    expect(summary.confirmed.rate).toBeNull();
    expect(summary.counts.not_yet_recorded).toBe(2);
  });
});
