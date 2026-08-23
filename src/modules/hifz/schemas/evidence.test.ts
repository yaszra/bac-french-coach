import { describe, expect, it } from "vitest";
import { gradeAttempt } from "../domain/grading";
import {
  attemptEvidenceSchema,
  attemptSubmissionSchema,
  gradingContextOf,
  unitIdSchema,
} from "./evidence";
import { gradeResultSchema } from "./grading";
import { fluencyObservationSchema, wordTimingsSchema } from "./timings";
import { humanVerdictSchema, verdictSubmissionSchema } from "./verification";

const listen = { exercise: "listen", playedMs: 4_000, ayahDurationMs: 4_000, replays: 1 };
const rebuild = {
  exercise: "rebuild",
  placements: [
    { index: 0, correct: true },
    { index: 1, correct: false },
  ],
  rescrambles: 2,
  elapsedMs: 9_000,
};

describe("a client cannot assert its own result", () => {
  it("rejects a payload carrying a score", () => {
    const result = attemptEvidenceSchema.safeParse({ ...listen, score: 0.98 });
    expect(result.success).toBe(false);
  });

  it("rejects a payload carrying a grade", () => {
    expect(attemptEvidenceSchema.safeParse({ ...rebuild, grade: "easy" }).success).toBe(false);
  });

  it("rejects a payload claiming mastery", () => {
    expect(attemptEvidenceSchema.safeParse({ ...listen, mastered: true }).success).toBe(false);
  });

  it("has no field for a result in the first place", () => {
    const parsed = attemptEvidenceSchema.parse(listen);
    expect(Object.keys(parsed).sort()).toEqual([
      "ayahDurationMs",
      "exercise",
      "playedMs",
      "replays",
    ]);
  });
});

describe("evidence payloads", () => {
  it("accepts one well-formed payload per rung", () => {
    const payloads = [
      listen,
      {
        exercise: "recall_first",
        producedWordCount: 3,
        expectedWordCount: 5,
        revealedAfterMs: null,
        hintsUsed: 1,
      },
      rebuild,
      { exercise: "gap_fill", gaps: [{ wordIndex: 2, correct: true, attempts: 1 }] },
      {
        exercise: "next_ayah_cue",
        cueAyah: "t:2:255>2:256",
        producedFirstWords: true,
        latencyMs: 1_800,
        hintsUsed: 0,
      },
      { exercise: "connect_chain", ayahsRequested: 3, ayahsProducedInOrder: 3, breaks: [] },
      {
        exercise: "oral_recitation",
        recordedMs: 15_000,
        expectedWordCount: 22,
        advisoryMatchRate: 0.91,
      },
    ];
    for (const payload of payloads) {
      expect(attemptEvidenceSchema.safeParse(payload).success).toBe(true);
    }
  });

  it("rejects an unknown rung", () => {
    expect(attemptEvidenceSchema.safeParse({ exercise: "guess", playedMs: 1 }).success).toBe(false);
  });

  it("rejects non-finite and negative observations", () => {
    expect(
      attemptEvidenceSchema.safeParse({ ...listen, playedMs: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
    expect(attemptEvidenceSchema.safeParse({ ...listen, playedMs: Number.NaN }).success).toBe(false);
    expect(attemptEvidenceSchema.safeParse({ ...listen, replays: -1 }).success).toBe(false);
    expect(attemptEvidenceSchema.safeParse({ ...listen, replays: 1.5 }).success).toBe(false);
    expect(attemptEvidenceSchema.safeParse({ ...listen, ayahDurationMs: 0 }).success).toBe(false);
  });

  it("requires at least one placement and one gap", () => {
    expect(attemptEvidenceSchema.safeParse({ ...rebuild, placements: [] }).success).toBe(false);
    expect(attemptEvidenceSchema.safeParse({ exercise: "gap_fill", gaps: [] }).success).toBe(false);
  });

  it("keeps text out of a cue: references only", () => {
    const cue = {
      exercise: "next_ayah_cue",
      producedFirstWords: true,
      latencyMs: 900,
      hintsUsed: 0,
    };
    expect(attemptEvidenceSchema.safeParse({ ...cue, cueAyah: "2:255" }).success).toBe(true);
    expect(attemptEvidenceSchema.safeParse({ ...cue, cueAyah: "the next ayah" }).success).toBe(false);
    // Any non-ASCII at all is refused, so scripture cannot ride in on a cue.
    expect(attemptEvidenceSchema.safeParse({ ...cue, cueAyah: "cue-āyah" }).success).toBe(false);
  });
});

describe("attempt submissions", () => {
  it("accepts a submission and adapts a null scaffold to an unknown one", () => {
    const parsed = attemptSubmissionSchema.parse({
      unitId: "b:2:255",
      evidence: listen,
      scaffold: null,
    });
    expect(parsed.unitId).toBe("b:2:255");
    expect(gradingContextOf(parsed.scaffold)).toEqual({});
    expect(gradingContextOf("first_letters")).toEqual({ scaffold: "first_letters" });
  });

  it("rejects a client-supplied timestamp: the server dates its own evidence", () => {
    const result = attemptSubmissionSchema.safeParse({
      unitId: "b:2:255",
      evidence: listen,
      scaffold: null,
      occurredAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed unit id", () => {
    expect(unitIdSchema.safeParse("b:2:255").success).toBe(true);
    expect(unitIdSchema.safeParse("t:2:255>2:256").success).toBe(true);
    expect(unitIdSchema.safeParse("not-a-unit").success).toBe(false);
  });
});

describe("grade results at the boundary", () => {
  it("validates each of the three answers the grader can give", () => {
    const graded = gradeAttempt({
      exercise: "listen",
      playedMs: 4_000,
      ayahDurationMs: 4_000,
      replays: 0,
    });
    const human = gradeAttempt({
      exercise: "oral_recitation",
      recordedMs: 9_000,
      expectedWordCount: 12,
      advisoryMatchRate: null,
    });
    const insufficient = gradeAttempt({ exercise: "gap_fill", gaps: [] });
    for (const result of [graded, human, insufficient]) {
      expect(gradeResultSchema.safeParse(result).success).toBe(true);
    }
  });

  it("rejects a grade with an out-of-range evidence strength", () => {
    const result = gradeResultSchema.safeParse({
      kind: "graded",
      grade: "easy",
      evidenceStrength: 1.4,
      rationale: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("verdicts and timings", () => {
  it("requires a person on every verdict", () => {
    const at = new Date("2026-03-01T09:00:00Z");
    expect(
      humanVerdictSchema.safeParse({
        unitId: "b:2:255",
        outcome: "verified",
        at,
        verifiedBy: "user_teacher_1",
      }).success,
    ).toBe(true);
    expect(
      humanVerdictSchema.safeParse({ unitId: "b:2:255", outcome: "verified", at, verifiedBy: "" })
        .success,
    ).toBe(false);
  });

  it("does not let a client name the person or the moment", () => {
    const result = verdictSubmissionSchema.safeParse({
      unitId: "b:2:255",
      outcome: "verified",
      verifiedBy: "user_someone_else",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty timing set: not aligned yet is a legitimate state", () => {
    expect(wordTimingsSchema.safeParse([]).success).toBe(true);
    expect(
      wordTimingsSchema.safeParse([{ wordIndex: 0, startMs: 0, endMs: 400 }]).success,
    ).toBe(true);
    expect(
      wordTimingsSchema.safeParse([{ wordIndex: 0, startMs: -1, endMs: 400 }]).success,
    ).toBe(false);
    expect(fluencyObservationSchema.safeParse({ wordIndex: 3, latencyMs: 900 }).success).toBe(true);
  });
});
