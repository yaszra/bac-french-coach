import { describe, expect, it } from "vitest";

import type { LearnerTier } from "@/modules/memory/domain/types";

import type { ConceptObservation, EvidenceKind, Presentation } from "./evidence";
import {
  KIDS_CEILING_MINUTES,
  LESSON_PHASES,
  READING_TIER_POLICIES,
  buildLessonPlan,
  type ConceptPlanState,
} from "./lessonPlan";
import { ladderState } from "./masteryLadder";
import { smartScore } from "./smartscore";

const DAY = 86_400_000;
const START = new Date("2026-03-01T09:00:00.000Z");
const NOW = new Date(START.getTime() + 2 * DAY);

function obs(
  conceptId: string,
  correct: boolean,
  session: number,
  index: number,
  presentation: Presentation = "ordered",
  evidenceKind: EvidenceKind = "machine_checked",
): ConceptObservation {
  return {
    conceptId,
    correct,
    at: new Date(START.getTime() + (session - 1) * DAY + index * 60_000),
    activityKind: presentation === "in_person" ? "production" : "recognition",
    evidenceKind,
    presentation,
    sessionId: `s${session}`,
  };
}

function planState(
  conceptId: string,
  observations: readonly ConceptObservation[],
  options: { unlocked?: boolean; dueAt?: Date; now?: Date } = {},
): ConceptPlanState {
  return {
    conceptId,
    smartScore: smartScore(conceptId, observations, {
      ...(options.now === undefined ? {} : { now: options.now }),
    }),
    ladder: ladderState(conceptId, observations, { hasTeacher: false }),
    unlocked: options.unlocked ?? true,
    ...(options.dueAt === undefined ? {} : { dueAt: options.dueAt }),
  };
}

/** A concept nothing has been recorded for. */
function fresh(conceptId: string, unlocked = true): ConceptPlanState {
  return planState(conceptId, [], { unlocked });
}

/** A concept with some correct evidence but not enough to be secure. */
function emerging(conceptId: string): ConceptPlanState {
  return planState(
    conceptId,
    Array.from({ length: 4 }, (_unused, index) => obs(conceptId, true, 1, index)),
  );
}

/** A concept with a secure record, optionally due for review. */
function secure(conceptId: string, dueAt?: Date): ConceptPlanState {
  const observations = [1, 2, 3].flatMap((session) =>
    Array.from({ length: 7 }, (_unused, index) => obs(conceptId, true, session, index)),
  );
  return planState(conceptId, observations, {
    ...(dueAt === undefined ? {} : { dueAt }),
    now: NOW,
  });
}

/** A concept the learner has taken all the way up the ladder. */
function mastered(conceptId: string, dueAt?: Date): ConceptPlanState {
  const observations = [
    ...Array.from({ length: 7 }, (_unused, index) => obs(conceptId, true, 1, index, "ordered")),
    ...Array.from({ length: 5 }, (_unused, index) => obs(conceptId, true, 2, index, "randomized")),
    ...Array.from({ length: 5 }, (_unused, index) => obs(conceptId, true, 3, index, "randomized")),
    obs(conceptId, true, 3, 20, "in_person", "self_confirmed"),
  ];
  const state = planState(conceptId, observations, {
    ...(dueAt === undefined ? {} : { dueAt }),
    now: NOW,
  });
  return state;
}

describe("the tier budget", () => {
  it("holds kids to ten minutes however much is asked for", () => {
    const plan = buildLessonPlan({
      tier: "kids",
      conceptStates: [
        emerging("letter.beh"),
        emerging("letter.teh"),
        emerging("letter.theh"),
        emerging("letter.jeem"),
        emerging("letter.hah"),
        emerging("letter.khah"),
        emerging("letter.dal"),
        emerging("letter.thal"),
        emerging("letter.reh"),
        emerging("letter.zain"),
        emerging("letter.seen"),
        emerging("letter.sheen"),
        emerging("letter.sad"),
        emerging("letter.dad"),
        emerging("letter.tah"),
        fresh("letter.zah"),
        fresh("letter.ain"),
        secure("letter.ghain", new Date(START.getTime() - DAY)),
      ],
      now: NOW,
      budgetMinutes: 120,
    });
    expect(plan.budgetMinutes).toBe(KIDS_CEILING_MINUTES);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(KIDS_CEILING_MINUTES);
    const summed = plan.items.reduce((total, item) => total + item.estimatedMinutes, 0);
    expect(summed).toBeLessThanOrEqual(KIDS_CEILING_MINUTES);
  });

  it("honours a shorter request", () => {
    const plan = buildLessonPlan({
      tier: "adult",
      conceptStates: [emerging("letter.beh"), emerging("letter.teh")],
      now: NOW,
      budgetMinutes: 4,
    });
    expect(plan.budgetMinutes).toBe(4);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(4);
  });

  it("keeps every tier inside its own ceiling", () => {
    for (const tier of ["kids", "teen", "adult"] satisfies readonly LearnerTier[]) {
      const plan = buildLessonPlan({
        tier,
        conceptStates: Array.from({ length: 40 }, (_unused, index) =>
          emerging(`letter.beh.fathah${index === 0 ? "" : ""}`),
        ).map((state, index) => ({ ...state, conceptId: `letter.test${index}` })),
        now: NOW,
        budgetMinutes: 500,
      });
      expect(plan.budgetMinutes).toBe(READING_TIER_POLICIES[tier].sessionBudgetMinutes);
      expect(plan.plannedMinutes).toBeLessThanOrEqual(plan.budgetMinutes);
    }
  });
});

describe("an honest empty plan", () => {
  it("says nothing is due rather than inventing work", () => {
    const notDue = mastered("letter.beh", new Date(NOW.getTime() + 30 * DAY));
    expect(notDue.ladder.complete).toBe(true);
    const plan = buildLessonPlan({ tier: "teen", conceptStates: [notDue], now: NOW });
    expect(plan.empty).toBe(true);
    expect(plan.items).toEqual([]);
    expect(plan.emptyReason?.key).toBe("reading.lesson.empty.nothing_due");
    expect(plan.emptyReason?.params["unlocked"]).toBe(1);
    expect(plan.emptyReason?.params["reviewCandidates"]).toBe(0);
    expect(plan.plannedMinutes).toBe(0);
  });

  it("says so when no concepts are assigned at all", () => {
    const plan = buildLessonPlan({ tier: "adult", conceptStates: [], now: NOW });
    expect(plan.empty).toBe(true);
    expect(plan.emptyReason?.key).toBe("reading.lesson.empty.no_concepts_assigned");
    expect(plan.considered.concepts).toBe(0);
  });

  it("says so when everything is still behind its prerequisites", () => {
    const plan = buildLessonPlan({
      tier: "adult",
      conceptStates: [fresh("letter.beh", false), fresh("letter.teh", false)],
      now: NOW,
    });
    expect(plan.empty).toBe(true);
    expect(plan.emptyReason?.key).toBe("reading.lesson.empty.all_prerequisites_pending");
    expect(plan.withheld).toHaveLength(2);
    expect(plan.withheld[0]?.reason.key).toBe("reading.lesson.withheld.prerequisites_not_met");
  });

  it("says so when no time was budgeted", () => {
    const plan = buildLessonPlan({
      tier: "kids",
      conceptStates: [emerging("letter.beh")],
      now: NOW,
      budgetMinutes: 0,
    });
    expect(plan.empty).toBe(true);
    expect(plan.emptyReason?.key).toBe("reading.lesson.empty.no_time_budgeted");
  });

  it("carries a null reason exactly when the plan is not empty", () => {
    const plan = buildLessonPlan({
      tier: "teen",
      conceptStates: [emerging("letter.beh")],
      now: NOW,
    });
    expect(plan.empty).toBe(false);
    expect(plan.emptyReason).toBeNull();
  });
});

describe("the shape of a session", () => {
  it("emits intro, then practice, then review", () => {
    const plan = buildLessonPlan({
      tier: "adult",
      conceptStates: [
        fresh("letter.beh"),
        emerging("letter.teh"),
        secure("letter.theh", new Date(START.getTime() - DAY)),
      ],
      now: NOW,
    });
    expect(plan.items.map((item) => item.phase)).toEqual(["intro", "practice", "review"]);
    const order = plan.items.map((item) => LESSON_PHASES.indexOf(item.phase));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("introduces at most the tier's cap of new concepts, and says why the rest waited", () => {
    const plan = buildLessonPlan({
      tier: "kids",
      conceptStates: [fresh("letter.beh"), fresh("letter.teh"), fresh("letter.theh")],
      now: NOW,
    });
    expect(plan.items.filter((item) => item.phase === "intro")).toHaveLength(1);
    expect(plan.withheld.map((item) => item.reason.key)).toContain(
      "reading.lesson.withheld.new_concept_cap",
    );
    expect(plan.withheld[0]?.reason.params["maxNewConcepts"]).toBe(1);
  });

  it("reserves room for due review before adding anything new", () => {
    const due = [1, 2, 3, 4, 5].map((index) =>
      secure(`letter.test${index}`, new Date(START.getTime() - DAY)),
    );
    const plan = buildLessonPlan({
      tier: "kids",
      conceptStates: [...due, fresh("letter.beh")],
      now: NOW,
    });
    expect(plan.items.some((item) => item.phase === "review")).toBe(true);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(KIDS_CEILING_MINUTES);
  });

  it("practises the weakest emerging concept first", () => {
    const weak = planState("letter.aaa", [obs("letter.aaa", true, 1, 0), obs("letter.aaa", false, 1, 1)]);
    const strong = planState(
      "letter.bbb",
      Array.from({ length: 5 }, (_unused, index) => obs("letter.bbb", true, 1, index)),
    );
    const plan = buildLessonPlan({
      tier: "adult",
      conceptStates: [strong, weak],
      now: NOW,
      budgetMinutes: 10,
    });
    const practice = plan.items.filter((item) => item.phase === "practice");
    expect(practice[0]?.conceptId).toBe("letter.aaa");
  });

  it("asks for production once a learner is working on the in-person rung", () => {
    const observations = [
      ...Array.from({ length: 6 }, (_unused, index) => obs("letter.qaf", true, 1, index, "ordered")),
      ...Array.from({ length: 4 }, (_unused, index) =>
        obs("letter.qaf", true, 2, index, "randomized"),
      ),
      ...Array.from({ length: 4 }, (_unused, index) =>
        obs("letter.qaf", true, 3, index, "randomized"),
      ),
    ];
    const state = planState("letter.qaf", observations, { now: NOW });
    expect(state.ladder.workingOn).toBe("in_person");
    const plan = buildLessonPlan({ tier: "adult", conceptStates: [state], now: NOW });
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.activityKind).toBe("production");
    expect(plan.items[0]?.presentation).toBe("in_person");
  });

  it("gives every item a reason carrying the numbers behind it", () => {
    const plan = buildLessonPlan({
      tier: "adult",
      conceptStates: [fresh("letter.beh"), emerging("letter.teh")],
      now: NOW,
    });
    for (const item of plan.items) {
      expect(item.reason.key).toMatch(/^reading\.lesson\.reason\./);
      expect(item.reason.params["conceptId"]).toBe(item.conceptId);
      expect(item.estimatedMinutes).toBeGreaterThan(0);
    }
  });
});

describe("no punishment mechanics reach the plan", () => {
  it("guarantees no hearts, no timers, no streak penalties, no deductions", () => {
    const plan = buildLessonPlan({
      tier: "kids",
      conceptStates: [emerging("letter.beh")],
      now: NOW,
    });
    expect(plan.guarantees).toEqual({
      hearts: false,
      timers: false,
      streakPenalties: false,
      scoreDeductions: false,
    });
  });

  it("reports what it looked at, so an empty plan can be checked", () => {
    const plan = buildLessonPlan({
      tier: "teen",
      conceptStates: [fresh("letter.beh"), fresh("letter.teh", false), emerging("letter.theh")],
      now: NOW,
    });
    expect(plan.considered).toEqual({
      concepts: 3,
      unlocked: 2,
      introCandidates: 1,
      practiceCandidates: 1,
      reviewCandidates: 0,
    });
  });

  it("is deterministic for the same inputs", () => {
    const states = [fresh("letter.beh"), emerging("letter.teh"), emerging("letter.theh")];
    const first = buildLessonPlan({ tier: "teen", conceptStates: states, now: NOW });
    expect(buildLessonPlan({ tier: "teen", conceptStates: states, now: NOW })).toEqual(first);
    expect(buildLessonPlan({ tier: "teen", conceptStates: [...states].reverse(), now: NOW }).items)
      .toEqual(first.items);
  });
});
