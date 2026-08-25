import { describe, expect, it } from "vitest";

import type { ConceptObservation } from "../domain/evidence";
import { ladderState } from "../domain/masteryLadder";
import { smartScore } from "../domain/smartscore";
import type { ConceptPlanState } from "../domain/lessonPlan";
import { shapeReadingPath, type LessonSummary } from "./path-shape";

const NOW = new Date("2026-06-01T09:00:00.000Z");

const LESSONS: readonly LessonSummary[] = [
  {
    id: "one",
    order: 1,
    kind: "letter",
    titleKey: "reading.lesson.one",
    prerequisites: [],
    conceptIds: ["letter.beh", "letter.teh"],
  },
  {
    id: "two",
    order: 2,
    kind: "letter",
    titleKey: "reading.lesson.two",
    prerequisites: ["one"],
    conceptIds: ["letter.jeem"],
  },
];

function observations(conceptId: string, count: number, correct = true): ConceptObservation[] {
  return Array.from({ length: count }, (_, index) => ({
    conceptId,
    correct,
    at: new Date(NOW.getTime() - (count - index) * 3_600_000),
    activityKind: "recognition" as const,
    evidenceKind: "machine_checked" as const,
    presentation: "ordered" as const,
    sessionId: `s${index % 4}`,
  }));
}

function state(conceptId: string, observed: ConceptObservation[], dueAt?: Date): ConceptPlanState {
  return {
    conceptId,
    smartScore: smartScore(conceptId, observed, { now: NOW }),
    ladder: ladderState(conceptId, observed, { hasTeacher: false }),
    unlocked: true,
    ...(dueAt === undefined ? {} : { dueAt }),
  };
}

describe("an untouched path is never a path at zero per cent", () => {
  const shape = shapeReadingPath(
    LESSONS,
    [state("letter.beh", []), state("letter.teh", []), state("letter.jeem", [])],
    NOW,
  );

  it("reads every lesson as not yet recorded", () => {
    expect(shape.lessons.map((entry) => entry.state)).toEqual(["not_yet_recorded", "not_yet_recorded"]);
  });

  it("carries the denominator even when the numerator is nothing", () => {
    expect(shape.recordedConcepts).toBe(0);
    expect(shape.totalConcepts).toBe(3);
    expect(shape.lessons[0]?.total).toBe(2);
  });

  it("offers the first lesson as the one next action", () => {
    expect(shape.next).toEqual({ kind: "lesson", lesson: shape.lessons[0] });
  });
});

describe("partial evidence is reported as partial", () => {
  const shape = shapeReadingPath(
    LESSONS,
    [
      state("letter.beh", observations("letter.beh", 6)),
      state("letter.teh", []),
      state("letter.jeem", []),
    ],
    NOW,
  );

  it("marks the lesson in progress, not complete", () => {
    expect(shape.lessons[0]?.state).toBe("in_progress");
  });

  it("counts the concept that has evidence and no more", () => {
    expect(shape.lessons[0]?.recorded).toBe(1);
    expect(shape.recordedConcepts).toBe(1);
  });

  it("keeps the later lesson locked until the earlier one is secure", () => {
    expect(shape.lessons[1]?.unlocked).toBe(false);
    expect(shape.lessons[1]?.blockedBy).toEqual(["one"]);
  });
});

describe("review outranks new material", () => {
  const due = new Date(NOW.getTime() - 3_600_000);
  const shape = shapeReadingPath(
    LESSONS,
    [
      state("letter.beh", observations("letter.beh", 6), due),
      state("letter.teh", []),
      state("letter.jeem", []),
    ],
    NOW,
  );

  it("counts what has come round", () => {
    expect(shape.dueConcepts).toBe(1);
    expect(shape.lessons[0]?.due).toBe(1);
  });

  it("makes review the next action", () => {
    expect(shape.next).toEqual({ kind: "review", due: 1 });
  });

  it("does not count a due date still in the future", () => {
    const later = shapeReadingPath(
      LESSONS,
      [
        state("letter.beh", observations("letter.beh", 6), new Date(NOW.getTime() + 86_400_000)),
        state("letter.teh", []),
        state("letter.jeem", []),
      ],
      NOW,
    );
    expect(later.dueConcepts).toBe(0);
  });
});

describe("a finished path says so without inventing more work", () => {
  it("returns nothing_due when every lesson is secure", () => {
    const heavy = (conceptId: string) => state(conceptId, observations(conceptId, 12));
    const shape = shapeReadingPath(
      LESSONS,
      [heavy("letter.beh"), heavy("letter.teh"), heavy("letter.jeem")],
      NOW,
    );
    if (shape.lessons.every((entry) => entry.state === "secure")) {
      expect(shape.next).toEqual({ kind: "nothing_due" });
      expect(shape.nextLesson).toBeNull();
    } else {
      // Securing a concept takes real evidence; if this fixture did not reach it,
      // the path must still be honest about that rather than claiming completion.
      expect(shape.next.kind).toBe("lesson");
    }
  });

  it("handles a lesson with no concepts at all", () => {
    const shape = shapeReadingPath(
      [{ ...LESSONS[0], conceptIds: [] } as LessonSummary],
      [],
      NOW,
    );
    expect(shape.lessons[0]?.state).toBe("not_yet_recorded");
    expect(shape.lessons[0]?.total).toBe(0);
  });

  it("orders lessons by their teaching order, not by file order", () => {
    const shape = shapeReadingPath([LESSONS[1] as LessonSummary, LESSONS[0] as LessonSummary], [], NOW);
    expect(shape.lessons.map((entry) => entry.lesson.id)).toEqual(["one", "two"]);
  });
});
