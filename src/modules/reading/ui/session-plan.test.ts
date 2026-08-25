import { describe, expect, it } from "vitest";

import { evaluateActivity } from "../domain/activities";
import { ladderState } from "../domain/masteryLadder";
import { smartScore } from "../domain/smartscore";
import type { ConceptPlanState } from "../domain/lessonPlan";
import { decodeActivityId } from "./activity-id";
import { CHOICE_COUNT, activityFor, buildReadingSession } from "./session-plan";

const NOW = new Date("2026-06-01T09:00:00.000Z");
const SESSION = "sitting1";

function fresh(conceptId: string): ConceptPlanState {
  return {
    conceptId,
    smartScore: smartScore(conceptId, [], { now: NOW }),
    ladder: ladderState(conceptId, [], { hasTeacher: false }),
    unlocked: true,
  };
}

const CONCEPTS = ["letter.beh", "letter.teh", "letter.jeem"].map(fresh);

describe("a sitting is laid out from the plan, and never beyond it", () => {
  const session = buildReadingSession({
    tier: "teen",
    conceptStates: CONCEPTS,
    now: NOW,
    sessionId: SESSION,
    hasTeacher: false,
  });

  it("emits one payload per planned item", () => {
    expect(session.items.length).toBe(session.plan.items.length);
  });

  it("keeps the planner's guarantees intact", () => {
    expect(session.plan.guarantees).toEqual({
      hearts: false,
      timers: false,
      streakPenalties: false,
      scoreDeductions: false,
    });
  });

  it("carries the sitting id inside every activity id", () => {
    for (const item of session.items) {
      expect(decodeActivityId(item.activityId)?.sessionId).toBe(SESSION);
    }
  });

  it("carries the planner's reason through untouched", () => {
    for (const [index, item] of session.items.entries()) {
      expect(item.reasonKey).toBe(session.plan.items[index]?.reason.key);
    }
  });
});

describe("the client is never handed the answer", () => {
  const session = buildReadingSession({
    tier: "adult",
    conceptStates: CONCEPTS,
    now: NOW,
    sessionId: SESSION,
    hasTeacher: false,
  });
  const item = session.items.find((candidate) => candidate.kind === "recognition");

  it("has a recognition item to check", () => {
    expect(item).toBeDefined();
  });

  it("emits no answer field of any kind", () => {
    expect(Object.keys(item ?? {})).not.toContain("answerChoiceId");
    expect(JSON.stringify(item)).not.toContain("answerChoiceId");
  });

  it("offers the tier's number of choices", () => {
    expect(item?.choices.length).toBe(CHOICE_COUNT.adult);
  });

  it("gives a child three choices and no more", () => {
    const kids = buildReadingSession({
      tier: "kids",
      conceptStates: CONCEPTS,
      now: NOW,
      sessionId: SESSION,
      hasTeacher: false,
    });
    const kidItem = kids.items.find((candidate) => candidate.kind === "recognition");
    expect(kidItem?.choices.length).toBe(CHOICE_COUNT.kids);
  });

  it("never offers the same concept twice among the choices", () => {
    const ids = (item?.choices ?? []).map((choice) => choice.conceptId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("always includes the concept under test among the choices", () => {
    expect((item?.choices ?? []).some((choice) => choice.conceptId === item?.conceptId)).toBe(true);
  });
});

describe("the server can rebuild any activity from its id alone", () => {
  const session = buildReadingSession({
    tier: "teen",
    conceptStates: CONCEPTS,
    now: NOW,
    sessionId: SESSION,
    hasTeacher: false,
  });

  it("rebuilds the identical choices in the identical order", () => {
    for (const item of session.items) {
      const parts = decodeActivityId(item.activityId);
      expect(parts).not.toBeNull();
      const rebuilt = activityFor(item.activityId, parts?.conceptId ?? "", item.kind, item.presentation, {
        choiceCount: CHOICE_COUNT.teen,
        observedBy: "self",
      });
      if (rebuilt.kind !== "recognition" || item.kind !== "recognition") continue;
      expect(rebuilt.choices.map((choice) => choice.choiceId)).toEqual(
        item.choices.map((choice) => choice.choiceId),
      );
    }
  });

  it("grades a choice the client never saw the key for", () => {
    const item = session.items.find((candidate) => candidate.kind === "recognition");
    const parts = decodeActivityId(item?.activityId ?? "");
    const rebuilt = activityFor(
      item?.activityId ?? "",
      parts?.conceptId ?? "",
      "recognition",
      parts?.presentation ?? "ordered",
      { choiceCount: CHOICE_COUNT.teen, observedBy: "self" },
    );
    if (rebuilt.kind !== "recognition") throw new Error("expected a recognition activity");

    const hit = evaluateActivity(rebuilt, {
      kind: "recognition",
      activityId: rebuilt.activityId,
      choiceId: rebuilt.answerChoiceId,
      at: NOW,
      sessionId: SESSION,
    });
    expect(hit.correct).toBe(true);
    expect(hit.penalty).toBeNull();

    const wrongChoice = rebuilt.choices.find((choice) => choice.choiceId !== rebuilt.answerChoiceId);
    const miss = evaluateActivity(rebuilt, {
      kind: "recognition",
      activityId: rebuilt.activityId,
      choiceId: wrongChoice?.choiceId ?? "",
      at: NOW,
      sessionId: SESSION,
    });
    expect(miss.correct).toBe(false);
    expect(miss.penalty).toBeNull();
    expect(miss.correction?.messageKey.startsWith("reading.correction.")).toBe(true);
  });
});

describe("who is expected to listen", () => {
  it("expects the learner when there is no teacher", () => {
    const solo = buildReadingSession({
      tier: "adult",
      conceptStates: CONCEPTS,
      now: NOW,
      sessionId: SESSION,
      hasTeacher: false,
    });
    expect(solo.items.every((item) => item.observedBy === "self")).toBe(true);
  });

  it("expects the teacher when there is one", () => {
    const taught = buildReadingSession({
      tier: "adult",
      conceptStates: CONCEPTS,
      now: NOW,
      sessionId: SESSION,
      hasTeacher: true,
    });
    expect(taught.items.every((item) => item.observedBy === "teacher")).toBe(true);
  });
});

describe("an empty plan produces an empty sitting, not a padded one", () => {
  it("emits nothing and says why", () => {
    const session = buildReadingSession({
      tier: "kids",
      conceptStates: [],
      now: NOW,
      sessionId: SESSION,
      hasTeacher: false,
    });
    expect(session.items).toEqual([]);
    expect(session.plan.empty).toBe(true);
    expect(session.plan.emptyReason?.key.startsWith("reading.")).toBe(true);
  });

  it("keeps a child's sitting inside the ten-minute ceiling", () => {
    const session = buildReadingSession({
      tier: "kids",
      conceptStates: CONCEPTS,
      now: NOW,
      sessionId: SESSION,
      hasTeacher: false,
      budgetMinutes: 60,
    });
    expect(session.plan.budgetMinutes).toBeLessThanOrEqual(10);
    expect(session.plan.plannedMinutes).toBeLessThanOrEqual(10);
  });
});
