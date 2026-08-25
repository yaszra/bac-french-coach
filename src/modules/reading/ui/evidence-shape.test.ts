import { describe, expect, it } from "vitest";

import { ladderState } from "../domain/masteryLadder";
import {
  SESSION_GAP_MINUTES,
  activityKindOfRetrieval,
  correctnessOfGrade,
  evidenceKindOfRetrieval,
  gradeFor,
  observationsFromRows,
  presentationForActivity,
  retrievalTypeFor,
  sittingIdOf,
  type StoredAttemptRow,
} from "./evidence-shape";

const START = new Date("2026-05-01T09:00:00.000Z");

function row(minutes: number, grade: "good" | "again", retrievalType = "recognition"): StoredAttemptRow {
  return {
    conceptId: "letter.beh",
    retrievalType,
    grade,
    occurredAt: new Date(START.getTime() + minutes * 60_000),
  };
}

describe("evidence kinds are read off the retrieval type, never guessed", () => {
  it("maps the three reading retrieval types", () => {
    expect(evidenceKindOfRetrieval("recognition")).toBe("machine_checked");
    expect(evidenceKindOfRetrieval("production")).toBe("self_confirmed");
    expect(evidenceKindOfRetrieval("oral_recitation")).toBe("teacher_observed");
  });

  it("refuses a retrieval type that is not reading evidence", () => {
    expect(evidenceKindOfRetrieval("rebuild")).toBeNull();
    expect(activityKindOfRetrieval("gap_fill")).toBeNull();
  });

  it("round-trips activity kind and evidence kind", () => {
    expect(retrievalTypeFor("recognition", "machine_checked")).toBe("recognition");
    expect(retrievalTypeFor("production", "self_confirmed")).toBe("production");
    expect(retrievalTypeFor("production", "teacher_observed")).toBe("oral_recitation");
    expect(activityKindOfRetrieval("oral_recitation")).toBe("production");
  });

  it("never lets a machine check masquerade as a teacher's ear", () => {
    expect(retrievalTypeFor("recognition", "teacher_observed")).toBe("recognition");
  });
});

describe("presentation follows the rung, and a machine check is never in person", () => {
  it("uses the rung for recognition below the top", () => {
    expect(presentationForActivity("ordered", "recognition")).toBe("ordered");
    expect(presentationForActivity("randomized", "recognition")).toBe("randomized");
  });

  it("clamps a top-rung recognition to randomized", () => {
    expect(presentationForActivity("in_person", "recognition")).toBe("randomized");
  });

  it("always marks a spoken answer in person", () => {
    expect(presentationForActivity("ordered", "production")).toBe("in_person");
    expect(presentationForActivity("in_person", "production")).toBe("in_person");
  });
});

describe("grades", () => {
  it("records a hit as good and a miss as again", () => {
    expect(gradeFor(true)).toBe("good");
    expect(gradeFor(false)).toBe("again");
  });

  it("reads a stored grade back as correctness", () => {
    expect(correctnessOfGrade("good")).toBe(true);
    expect(correctnessOfGrade("easy")).toBe(true);
    expect(correctnessOfGrade("again")).toBe(false);
    expect(correctnessOfGrade("hard")).toBe(false);
  });
});

describe("rebuilding observations from stored rows", () => {
  it("returns nothing for no rows", () => {
    expect(observationsFromRows([], { hasTeacher: false })).toEqual([]);
  });

  it("drops rows that are not reading evidence", () => {
    expect(observationsFromRows([row(0, "good", "rebuild")], { hasTeacher: false })).toEqual([]);
  });

  it("sorts oldest first however the rows arrive", () => {
    const built = observationsFromRows([row(10, "again"), row(0, "good")], { hasTeacher: false });
    expect(built.map((observation) => observation.correct)).toEqual([true, false]);
  });

  it("groups attempts inside the gap into one sitting", () => {
    const built = observationsFromRows([row(0, "good"), row(SESSION_GAP_MINUTES - 1, "good")], {
      hasTeacher: false,
    });
    expect(new Set(built.map((observation) => observation.sessionId)).size).toBe(1);
  });

  it("starts a new sitting after a long enough silence", () => {
    const built = observationsFromRows([row(0, "good"), row(SESSION_GAP_MINUTES + 1, "good")], {
      hasTeacher: false,
    });
    expect(new Set(built.map((observation) => observation.sessionId)).size).toBe(2);
  });

  it("names a sitting by the minute it began", () => {
    expect(sittingIdOf(START)).toBe(`sit-${Math.floor(START.getTime() / 60_000)}`);
  });

  it("carries elapsed time through when it was recorded, and omits it when not", () => {
    const built = observationsFromRows(
      [{ ...row(0, "good"), durationMs: 1200 }, row(1, "good")],
      { hasTeacher: false },
    );
    expect(built[0]?.elapsedMs).toBe(1200);
    expect(built[1]?.elapsedMs).toBeUndefined();
  });

  it("replays the rung each activity was built at, rather than assuming one", () => {
    // Enough correct answers, in enough sittings, to close the first rung — after
    // which the presentation of later items must have moved on.
    const rows = [
      row(0, "good"),
      row(1, "good"),
      row(2, "good"),
      row(SESSION_GAP_MINUTES + 1, "good"),
      row(SESSION_GAP_MINUTES + 2, "good"),
      row(SESSION_GAP_MINUTES + 3, "good"),
      row(2 * SESSION_GAP_MINUTES + 10, "good"),
      row(2 * SESSION_GAP_MINUTES + 11, "good"),
      row(2 * SESSION_GAP_MINUTES + 12, "good"),
    ];
    const built = observationsFromRows(rows, { hasTeacher: false });
    expect(built[0]?.presentation).toBe("ordered");
    expect(new Set(built.map((observation) => observation.presentation)).size).toBeGreaterThan(1);
  });

  it("agrees with the ladder: every observation sits at the rung the ladder then had", () => {
    const rows = [row(0, "good"), row(1, "good"), row(2, "again"), row(40, "good")];
    const built = observationsFromRows(rows, { hasTeacher: false });
    for (let index = 0; index < built.length; index += 1) {
      const before = built.slice(0, index);
      const expected = presentationForActivity(
        ladderState("letter.beh", before, { hasTeacher: false }).workingOn,
        built[index]?.activityKind ?? "recognition",
      );
      expect(built[index]?.presentation).toBe(expected);
    }
  });

  it("keeps a self-confirmation distinguishable from a teacher's verdict", () => {
    const built = observationsFromRows(
      [row(0, "good", "production"), row(1, "good", "oral_recitation")],
      { hasTeacher: true },
    );
    expect(built[0]?.evidenceKind).toBe("self_confirmed");
    expect(built[1]?.evidenceKind).toBe("teacher_observed");
  });

  it("keeps concepts apart when replaying rungs", () => {
    const built = observationsFromRows(
      [row(0, "good"), { ...row(1, "good"), conceptId: "letter.teh" }],
      { hasTeacher: false },
    );
    expect(built[1]?.presentation).toBe("ordered");
  });
});
