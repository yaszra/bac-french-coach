import { describe, expect, it } from "vitest";

import {
  CORRECTION_KEYS,
  DEFAULT_CHOICE_COUNT,
  OBSERVER_EVIDENCE,
  PRACTICE_GUARANTEES,
  buildProductionActivity,
  buildRecognitionActivity,
  correctionFor,
  evaluateActivity,
  promptCodepointsOf,
  type ProductionResponse,
  type RecognitionResponse,
} from "./activities";

const AT = new Date("2026-03-01T09:00:00.000Z");
const SESSION = "session-1";

function recognitionOn(conceptId: string, activityId = "act-1", choiceCount = 4) {
  return buildRecognitionActivity({ activityId, conceptId, choiceCount, presentation: "ordered" });
}

function answer(activityId: string, choiceId: string, elapsedMs?: number): RecognitionResponse {
  return {
    kind: "recognition",
    activityId,
    choiceId,
    at: AT,
    sessionId: SESSION,
    ...(elapsedMs === undefined ? {} : { elapsedMs }),
  };
}

function observed(
  activityId: string,
  observer: ProductionResponse["observer"],
  verdict: ProductionResponse["verdict"],
): ProductionResponse {
  return { kind: "production", activityId, observer, verdict, at: AT, sessionId: SESSION };
}

describe("no punishment mechanics", () => {
  it("guarantees no hearts, timers, streak penalties or score deductions", () => {
    expect(PRACTICE_GUARANTEES).toEqual({
      hearts: false,
      timers: false,
      streakPenalties: false,
      scoreDeductions: false,
    });
  });

  it("returns `penalty: null` on every path, hit or miss", () => {
    const activity = recognitionOn("letter.beh");
    const wrong = activity.choices.find((choice) => choice.choiceId !== activity.answerChoiceId);
    expect(evaluateActivity(activity, answer(activity.activityId, activity.answerChoiceId)).penalty)
      .toBeNull();
    expect(evaluateActivity(activity, answer(activity.activityId, wrong?.choiceId ?? "")).penalty)
      .toBeNull();
  });
});

describe("buildRecognitionActivity", () => {
  it("puts the answer on screen exactly once, alongside plausible distractors", () => {
    const activity = recognitionOn("letter.beh", "act-x", 5);
    expect(activity.choices).toHaveLength(5);
    const matching = activity.choices.filter((choice) => choice.conceptId === "letter.beh");
    expect(matching).toHaveLength(1);
    expect(matching[0]?.choiceId).toBe(activity.answerChoiceId);
    const distractors = activity.choices
      .filter((choice) => choice.choiceId !== activity.answerChoiceId)
      .map((choice) => choice.conceptId);
    expect(new Set(distractors).size).toBe(4);
    expect(distractors).not.toContain("letter.beh");
  });

  it("clamps the choice count into the buildable range", () => {
    expect(recognitionOn("letter.beh", "a", 1).choices).toHaveLength(2);
    expect(recognitionOn("letter.beh", "a", 99).choices.length).toBeLessThanOrEqual(8);
    expect(buildRecognitionActivity({ activityId: "a", conceptId: "letter.beh" }).choices).toHaveLength(
      DEFAULT_CHOICE_COUNT,
    );
  });

  it("is deterministic — the same activity id always lays out the same way", () => {
    expect(recognitionOn("letter.sad", "act-7")).toEqual(recognitionOn("letter.sad", "act-7"));
  });

  it("varies the answer's position across activity ids rather than always first", () => {
    const positions = new Set(
      Array.from({ length: 24 }, (_unused, index) => {
        const activity = recognitionOn("letter.beh", `act-${index}`, 4);
        return activity.choices.findIndex((choice) => choice.choiceId === activity.answerChoiceId);
      }),
    );
    expect(positions.size).toBeGreaterThan(1);
  });

  it("shows bare codepoints only — a letter with a mark, never a phrase", () => {
    expect(promptCodepointsOf("letter.beh")).toHaveLength(1);
    expect(promptCodepointsOf("letter.beh.fathah")).toHaveLength(2);
    expect(promptCodepointsOf("rule.noon_sakinah.ikhfa")).toEqual([]);
  });
});

describe("evaluateActivity — recognition", () => {
  it("records a match as machine-checked evidence that counts", () => {
    const activity = recognitionOn("letter.beh");
    const result = evaluateActivity(activity, answer(activity.activityId, activity.answerChoiceId, 1800));
    expect(result.correct).toBe(true);
    expect(result.evidenceKind).toBe("machine_checked");
    expect(result.countsTowardMastery).toBe(true);
    expect(result.correction).toBeNull();
    expect(result.observation?.correct).toBe(true);
    expect(result.observation?.elapsedMs).toBe(1800);
    expect(result.bearsOn).toEqual([
      { conceptId: "letter.beh", polarity: "supports", weight: 1 },
    ]);
  });

  it("records a miss with a correction and says which other concept was read", () => {
    const activity = recognitionOn("letter.beh");
    const wrong = activity.choices.find((choice) => choice.choiceId !== activity.answerChoiceId);
    const result = evaluateActivity(activity, answer(activity.activityId, wrong?.choiceId ?? ""));
    expect(result.correct).toBe(false);
    expect(result.correction).not.toBeNull();
    expect(result.observation?.chosenConceptId).toBe(wrong?.conceptId);
    expect(result.bearsOn[0]).toEqual({
      conceptId: "letter.beh",
      polarity: "contradicts",
      weight: 1,
    });
    expect(result.bearsOn[1]?.polarity).toBe("neutral");
  });

  it("treats a choice that is not on the activity as a miss with no chosen concept", () => {
    const activity = recognitionOn("letter.beh");
    const result = evaluateActivity(activity, answer(activity.activityId, "not-a-choice"));
    expect(result.correct).toBe(false);
    expect(result.observation?.chosenConceptId).toBeUndefined();
    expect(result.bearsOn).toHaveLength(1);
  });
});

describe("corrections describe what to notice, never a rebuke", () => {
  it("points at the dots when the skeleton is shared", () => {
    const correction = correctionFor("letter.beh", "letter.teh");
    expect(correction.messageKey).toBe(CORRECTION_KEYS.noticeTheDots);
    expect(correction.params["expectedDots"]).toBe("1:below");
    expect(correction.params["chosenDots"]).toBe("2:above");
  });

  it("points at the articulation place when the letters are made in the same spot", () => {
    expect(correctionFor("letter.sad", "letter.seen").messageKey).toBe(
      CORRECTION_KEYS.noticeTheMakhraj,
    );
  });

  it("names a known pair when nothing simpler explains it", () => {
    expect(correctionFor("letter.dad", "letter.zah").messageKey).toBe(CORRECTION_KEYS.knownPair);
  });

  it("points at the vowel when the letter was right", () => {
    expect(correctionFor("letter.beh.fathah", "letter.beh.kasrah").messageKey).toBe(
      CORRECTION_KEYS.noticeTheVowel,
    );
  });

  it("falls back to shape, then to looking again", () => {
    expect(correctionFor("letter.beh", "letter.ain").messageKey).toBe(
      CORRECTION_KEYS.noticeTheShape,
    );
    expect(correctionFor("sukun", "tanwin").messageKey).toBe(CORRECTION_KEYS.lookAgain);
  });

  it("uses i18n keys throughout, never literal sentences", () => {
    for (const key of Object.values(CORRECTION_KEYS)) {
      expect(key).toMatch(/^[a-z][a-z0-9]*(?:[._][a-z0-9]+)+$/);
    }
  });
});

describe("evaluateActivity — production is never machine-graded as mastery", () => {
  const activity = buildProductionActivity({ activityId: "prod-1", conceptId: "letter.dad" });

  it("maps each observer to exactly one evidence kind", () => {
    expect(OBSERVER_EVIDENCE).toEqual({
      teacher: "teacher_observed",
      self: "self_confirmed",
      advisory_listener: "advisory_only",
    });
  });

  it("counts a teacher's verdict toward mastery", () => {
    const result = evaluateActivity(activity, observed("prod-1", "teacher", "clear"));
    expect(result.correct).toBe(true);
    expect(result.evidenceKind).toBe("teacher_observed");
    expect(result.countsTowardMastery).toBe(true);
    expect(result.bearsOn[0]?.weight).toBe(1);
  });

  it("records a solo learner's self-confirmation without counting it toward mastery", () => {
    const result = evaluateActivity(activity, observed("prod-1", "self", "clear"));
    expect(result.correct).toBe(true);
    expect(result.evidenceKind).toBe("self_confirmed");
    expect(result.countsTowardMastery).toBe(false);
    expect(result.observation?.evidenceKind).toBe("self_confirmed");
    expect(result.bearsOn[0]?.weight).toBeLessThan(1);
  });

  it("never lets an advisory listener grade mastery", () => {
    const result = evaluateActivity(activity, observed("prod-1", "advisory_listener", "clear"));
    expect(result.evidenceKind).toBe("advisory_only");
    expect(result.countsTowardMastery).toBe(false);
  });

  it("returns a correction, not a penalty, when a teacher says not yet", () => {
    const result = evaluateActivity(activity, observed("prod-1", "teacher", "needs_work"));
    expect(result.correct).toBe(false);
    expect(result.countsTowardMastery).toBe(true);
    expect(result.correction?.messageKey).toBe(CORRECTION_KEYS.productionNeedsWork);
    expect(result.penalty).toBeNull();
  });

  it("records nothing at all when nobody observed", () => {
    const result = evaluateActivity(activity, observed("prod-1", "teacher", "not_observed"));
    expect(result.correct).toBeNull();
    expect(result.observation).toBeNull();
    expect(result.bearsOn).toEqual([]);
    expect(result.countsTowardMastery).toBe(false);
  });
});

describe("mismatched pairings decide nothing", () => {
  it("returns no observation when the response is for another activity", () => {
    const activity = recognitionOn("letter.beh", "act-a");
    const result = evaluateActivity(activity, answer("act-b", activity.answerChoiceId));
    expect(result.correct).toBeNull();
    expect(result.observation).toBeNull();
    expect(result.countsTowardMastery).toBe(false);
  });

  it("returns no observation when the response kind does not match the activity", () => {
    const activity = recognitionOn("letter.beh", "act-a");
    const result = evaluateActivity(activity, observed("act-a", "teacher", "clear"));
    expect(result.correct).toBeNull();
    expect(result.observation).toBeNull();
  });
});
