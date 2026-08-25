import { describe, expect, it } from "vitest";
import { FAMILY_EVENT_TYPES } from "@/modules/family/domain/home-task";
import { learningEventInput } from "@/modules/platform/events/types";
import { memoryProjection } from "@/modules/memory/repo/memory-projection";

/**
 * Adversarial check on the family/learning separation: I am not taking "there
 * is no path" on trust, I am trying to find one.
 */
describe("a home task cannot become memory state", () => {
  it("is refused at the event boundary", () => {
    for (const type of FAMILY_EVENT_TYPES) {
      const result = learningEventInput.safeParse({
        organizationId: "org",
        learnerUserId: "u1",
        type,
        idempotencyKey: "k".repeat(12),
        payload: {},
        occurredAt: new Date(),
      });
      expect(result.success, `${type} must not be an appendable learning event`).toBe(false);
    }
  });

  it("is not a type the memory projection folds over", () => {
    for (const type of FAMILY_EVENT_TYPES) {
      expect(memoryProjection.handles).not.toContain(type);
    }
  });

  it("cannot be smuggled in by relabelling it as an attempt", async () => {
    // The obvious attack: call it attempt.recorded and put the home task in the
    // payload. The payload schema is what stops it.
    const result = learningEventInput.safeParse({
      organizationId: "org",
      learnerUserId: "u1",
      type: "attempt.recorded",
      idempotencyKey: "k".repeat(12),
      payload: { homeTask: "read together", completed: true },
      occurredAt: new Date(),
    });
    // The envelope may parse, but parsePayload will reject the body.
    if (result.success) {
      const { parsePayload } = await import("@/modules/platform/events/types");
      expect(() => parsePayload("attempt.recorded", result.data.payload)).toThrow();
    }
  });
});
