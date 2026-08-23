import { describe, expect, it } from "vitest";

import { ARABIC_LETTERS, READING_LATTICE } from "../domain/concepts";
import { buildRecognitionActivity, evaluateActivity } from "../domain/activities";
import { ladderState } from "../domain/masteryLadder";
import { buildLessonPlan } from "../domain/lessonPlan";
import { resolveTalqin } from "../domain/talqin";
import { smartScore } from "../domain/smartscore";

import {
  activityEvaluationSchema,
  anomalySchema,
  arabicCodepointSchema,
  arabicLetterSchema,
  conceptIdSchema,
  i18nKeySchema,
  ladderStateSchema,
  lessonPlanSchema,
  practiceGuaranteesSchema,
  readingLatticeSchema,
  recognitionActivitySchema,
  recognitionResponseSchema,
  smartScoreSchema,
  talqinAssetSchema,
  talqinResolutionSchema,
} from "./index";

const AT = new Date("2026-03-01T09:00:00.000Z");

describe("the authored lattice satisfies its own boundary schema", () => {
  it("parses READING_LATTICE", () => {
    expect(readingLatticeSchema.safeParse(READING_LATTICE).success).toBe(true);
  });

  it("parses every letter in the table", () => {
    for (const letter of ARABIC_LETTERS) {
      expect(arabicLetterSchema.safeParse(letter).success).toBe(true);
    }
  });
});

describe("the sacred-content boundary", () => {
  it("admits a single Arabic codepoint and nothing longer", () => {
    expect(arabicCodepointSchema.safeParse("ب").success).toBe(true);
    expect(arabicCodepointSchema.safeParse("َ").success).toBe(true);
    // Two letters together are already more than this module is allowed to carry.
    expect(arabicCodepointSchema.safeParse("با").success).toBe(false);
    expect(arabicCodepointSchema.safeParse("").success).toBe(false);
    expect(arabicCodepointSchema.safeParse("a").success).toBe(false);
  });

  it("keeps concept ids ASCII and i18n keys key-shaped", () => {
    expect(conceptIdSchema.safeParse("letter.beh.fathah").success).toBe(true);
    expect(conceptIdSchema.safeParse("letter.ب").success).toBe(false);
    expect(conceptIdSchema.safeParse("Letter.Beh").success).toBe(false);
    expect(i18nKeySchema.safeParse("reading.concept.letter.beh").success).toBe(true);
    expect(i18nKeySchema.safeParse("Say the letter bāʾ").success).toBe(false);
  });
});

describe("a client never supplies its own verdict", () => {
  it("drops anything beyond the fields a recognition response may carry", () => {
    const parsed = recognitionResponseSchema.parse({
      kind: "recognition",
      activityId: "act-1",
      choiceId: "act-1:0",
      at: AT,
      sessionId: "s1",
      correct: true,
      score: 100,
    });
    expect(parsed).not.toHaveProperty("correct");
    expect(parsed).not.toHaveProperty("score");
  });

  it("refuses an evaluation carrying a penalty of any kind", () => {
    const activity = buildRecognitionActivity({ activityId: "act-1", conceptId: "letter.beh" });
    const evaluation = evaluateActivity(activity, {
      kind: "recognition",
      activityId: "act-1",
      choiceId: activity.answerChoiceId,
      at: AT,
      sessionId: "s1",
    });
    expect(recognitionActivitySchema.safeParse(activity).success).toBe(true);
    expect(activityEvaluationSchema.safeParse(evaluation).success).toBe(true);
    expect(
      activityEvaluationSchema.safeParse({ ...evaluation, penalty: { hearts: -1 } }).success,
    ).toBe(false);
  });
});

describe("state schemas accept what the engines produce", () => {
  it("parses a SmartScore, including the not-yet-recorded shape", () => {
    expect(smartScoreSchema.safeParse(smartScore("letter.beh", [])).success).toBe(true);
    const withEvidence = smartScore("letter.beh", [
      {
        conceptId: "letter.beh",
        correct: true,
        at: AT,
        activityKind: "recognition",
        evidenceKind: "machine_checked",
        presentation: "ordered",
        sessionId: "s1",
      },
    ]);
    expect(smartScoreSchema.safeParse(withEvidence).success).toBe(true);
  });

  it("parses a ladder state and keeps the two kinds of confirmation apart", () => {
    const state = ladderState("letter.beh", [], { hasTeacher: false });
    expect(ladderStateSchema.safeParse(state).success).toBe(true);
    // A projection cannot smuggle a self-confirmation in as a teacher's verdict.
    expect(
      ladderStateSchema.safeParse({ ...state, finalRungEvidenceKind: "machine_checked" }).success,
    ).toBe(false);
  });

  it("parses a lesson plan and refuses one that grew a heart counter", () => {
    const plan = buildLessonPlan({ tier: "kids", conceptStates: [], now: AT });
    expect(lessonPlanSchema.safeParse(plan).success).toBe(true);
    expect(practiceGuaranteesSchema.safeParse(plan.guarantees).success).toBe(true);
    expect(
      lessonPlanSchema.safeParse({ ...plan, guarantees: { ...plan.guarantees, hearts: true } })
        .success,
    ).toBe(false);
  });

  it("parses an anomaly shape", () => {
    expect(
      anomalySchema.safeParse({
        kind: "possible_guessing",
        conceptId: "letter.beh",
        reason: { key: "reading.anomaly.reason.answers_faster_than_plausible", params: {} },
        denominator: { attempts: 8, sessions: 2 },
        counts: { fastAnswers: 5, timedAnswers: 8 },
        relatedConceptId: null,
        severity: "notice",
      }).success,
    ).toBe(true);
  });
});

describe("talqīn audio cannot pass the boundary unlabelled", () => {
  const base = {
    assetId: "a-1",
    conceptId: "letter.qaf",
    source: "studio" as const,
    recordedAt: AT,
    durationMs: 1400,
  };

  it("accepts each labelled variant", () => {
    expect(
      talqinAssetSchema.safeParse({ ...base, provenance: "human", recordedByPersonId: "p-1" })
        .success,
    ).toBe(true);
    expect(
      talqinAssetSchema.safeParse({
        ...base,
        provenance: "studio_synth_reviewed",
        reviewedByPersonId: "p-2",
        reviewedAt: AT,
      }).success,
    ).toBe(true);
    expect(
      talqinAssetSchema.safeParse({
        ...base,
        source: "library",
        provenance: "library",
        libraryId: "l-1",
        reciterId: "r-1",
      }).success,
    ).toBe(true);
  });

  it("refuses audio with no provenance at all", () => {
    expect(talqinAssetSchema.safeParse(base).success).toBe(false);
    expect(talqinAssetSchema.safeParse({ ...base, provenance: "unknown" }).success).toBe(false);
  });

  it("refuses a synthesized model that nobody signed", () => {
    expect(
      talqinAssetSchema.safeParse({ ...base, provenance: "studio_synth_reviewed" }).success,
    ).toBe(false);
    expect(
      talqinAssetSchema.safeParse({
        ...base,
        provenance: "studio_synth_reviewed",
        reviewedByPersonId: "p-2",
      }).success,
    ).toBe(false);
  });

  it("parses both branches of a resolution", () => {
    expect(talqinResolutionSchema.safeParse(resolveTalqin({ conceptId: "letter.qaf" }, [])).success)
      .toBe(true);
    const resolved = resolveTalqin({ conceptId: "letter.qaf" }, [
      { ...base, provenance: "human", recordedByPersonId: "p-1" },
    ]);
    expect(talqinResolutionSchema.safeParse(resolved).success).toBe(true);
  });
});
