import { describe, expect, it } from "vitest";
import { attemptSubmissionSchema } from "../schemas/evidence";

/**
 * The submission boundary is the evidence rule made mechanical: a client can
 * describe what happened and cannot describe what it was worth. These tests
 * check the schema itself, because that is what enforces it — not a convention
 * anyone has to remember downstream.
 */
describe("what a client may submit", () => {
  const valid = {
    unitId: "b:78:1",
    scaffold: null,
    evidence: {
      exercise: "rebuild",
      placements: [
        { index: 0, correct: true },
        { index: 1, correct: true },
      ],
      rescrambles: 1,
      elapsedMs: 8_000,
    },
  };

  it("accepts observations", () => {
    expect(attemptSubmissionSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses a submission that asserts its own grade", () => {
    const result = attemptSubmissionSchema.safeParse({ ...valid, grade: "easy" });
    expect(result.success).toBe(false);
  });

  it("refuses a submission that asserts a score", () => {
    expect(attemptSubmissionSchema.safeParse({ ...valid, score: 100 }).success).toBe(false);
    expect(
      attemptSubmissionSchema.safeParse({
        ...valid,
        evidence: { ...valid.evidence, score: 100 },
      }).success,
    ).toBe(false);
  });

  it("refuses a submission that claims mastery", () => {
    expect(attemptSubmissionSchema.safeParse({ ...valid, verified: true }).success).toBe(false);
    expect(attemptSubmissionSchema.safeParse({ ...valid, mastered: true }).success).toBe(false);
  });

  it("has no field for the time it happened — the server stamps that", () => {
    expect(attemptSubmissionSchema.safeParse({ ...valid, occurredAt: "2020-01-01" }).success).toBe(false);
    const shape = Object.keys(attemptSubmissionSchema.shape);
    expect(shape).toEqual(["unitId", "evidence", "scaffold"]);
  });
});
