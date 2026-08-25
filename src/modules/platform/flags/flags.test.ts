import { describe, expect, it } from "vitest";
import { evaluateFlag, type FlagDefinition } from "./flags";

const def = (over: Partial<FlagDefinition> = {}): FlagDefinition => ({
  key: "scheduler.fsrs_v2",
  mode: "off",
  percentage: 0,
  ...over,
});

describe("feature flags", () => {
  it("respects on and off", () => {
    const subject = { organizationId: "org_a" };
    expect(evaluateFlag(def({ mode: "on" }), [], subject)).toBe(true);
    expect(evaluateFlag(def({ mode: "off" }), [], subject)).toBe(false);
  });

  it("lets the most specific assignment win", () => {
    const subject = { organizationId: "org_a", classroomId: "c1", learnerUserId: "u1" };
    const assignments = [
      { scopeType: "organization" as const, scopeId: "org_a", enabled: true },
      { scopeType: "learner" as const, scopeId: "u1", enabled: false },
    ];
    expect(evaluateFlag(def({ mode: "on" }), assignments, subject)).toBe(false);
  });

  it("is stable for the same subject", () => {
    const d = def({ mode: "percentage", percentage: 50 });
    const subject = { organizationId: "org_a", classroomId: "c9" };
    const first = evaluateFlag(d, [], subject);
    for (let i = 0; i < 50; i++) expect(evaluateFlag(d, [], subject)).toBe(first);
  });

  it("assigns experiments by classroom, so a room is never split", () => {
    const d = def({ mode: "percentage", percentage: 50 });
    const a = evaluateFlag(d, [], { organizationId: "org_a", classroomId: "c1", learnerUserId: "u1" });
    const b = evaluateFlag(d, [], { organizationId: "org_a", classroomId: "c1", learnerUserId: "u2" });
    expect(a).toBe(b);
  });

  it("spreads roughly evenly across classrooms", () => {
    const d = def({ mode: "percentage", percentage: 50 });
    let on = 0;
    const total = 400;
    for (let i = 0; i < total; i++) {
      if (evaluateFlag(d, [], { organizationId: "org_a", classroomId: `c${i}` })) on++;
    }
    expect(on / total).toBeGreaterThan(0.4);
    expect(on / total).toBeLessThan(0.6);
  });
});
