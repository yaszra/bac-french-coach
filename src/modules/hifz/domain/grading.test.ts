import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/modules/memory/domain/simulate";
import {
  DEFAULT_GRADING_THRESHOLDS,
  capGrade,
  downgrade,
  gradeAttempt,
  isPass,
  reviewEvidenceOf,
  type AttemptEvidence,
} from "./grading";

/** Placeholder placements: this module never sees a word, only whether one landed. */
const placements = (correct: readonly boolean[]) =>
  correct.map((value, index) => ({ index, correct: value }));

const graded = (evidence: AttemptEvidence) => {
  const result = gradeAttempt(evidence);
  if (result.kind !== "graded") throw new Error(`expected a grade, got ${result.kind}`);
  return result;
};

describe("gradeAttempt — the ear-gate", () => {
  it("always returns requires_human for an oral recitation", () => {
    const rand = mulberry32(20260823);
    for (let i = 0; i < 200; i += 1) {
      const result = gradeAttempt({
        exercise: "oral_recitation",
        recordedMs: Math.floor(rand() * 60_000),
        expectedWordCount: 1 + Math.floor(rand() * 40),
        advisoryMatchRate: rand(),
      });
      expect(result.kind).toBe("requires_human");
    }
  });

  it("refuses a flawless recitation just as firmly as a poor one", () => {
    const perfect = gradeAttempt({
      exercise: "oral_recitation",
      recordedMs: 12_000,
      expectedWordCount: 20,
      advisoryMatchRate: 1,
    });
    expect(perfect).toEqual({
      kind: "requires_human",
      reason: "hifz.grade.oral_recitation_requires_human",
    });
  });
});

describe("gradeAttempt — listening is exposure, never recall", () => {
  it("never yields good or easy, whatever the observations", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 300; i += 1) {
      const ayahDurationMs = 1_000 + Math.floor(rand() * 30_000);
      const result = gradeAttempt({
        exercise: "listen",
        playedMs: Math.floor(rand() * ayahDurationMs * 1.5),
        ayahDurationMs,
        replays: Math.floor(rand() * 12),
      });
      if (result.kind !== "graded") throw new Error("listening evidence should grade");
      expect(["again", "hard"]).toContain(result.grade);
    }
  });

  it("grades a complete listen as hard and says why", () => {
    const result = graded({
      exercise: "listen",
      playedMs: 10_000,
      ayahDurationMs: 10_000,
      replays: 0,
    });
    expect(result.grade).toBe("hard");
    expect(result.rationale).toContain("hifz.grade.listen_is_exposure_not_recall");
  });

  it("treats a barely-played āyah as not listened to at all", () => {
    const result = graded({
      exercise: "listen",
      playedMs: 1_000,
      ayahDurationMs: 10_000,
      replays: 0,
    });
    expect(result.grade).toBe("again");
    expect(result.rationale).toContain("hifz.grade.listen_incomplete");
  });

  it("carries almost no evidential weight", () => {
    const result = graded({
      exercise: "listen",
      playedMs: 10_000,
      ayahDurationMs: 10_000,
      replays: 0,
    });
    expect(result.evidenceStrength).toBeLessThan(0.1);
  });
});

describe("gradeAttempt — hints and reveals downgrade", () => {
  const clean: AttemptEvidence = {
    exercise: "recall_first",
    producedWordCount: 5,
    expectedWordCount: 5,
    revealedAfterMs: null,
    hintsUsed: 0,
  };

  it("grades a clean, complete recall as easy", () => {
    expect(graded(clean).grade).toBe("easy");
  });

  it("drops one rung per hint", () => {
    expect(graded({ ...clean, hintsUsed: 1 }).grade).toBe("good");
    expect(graded({ ...clean, hintsUsed: 2 }).grade).toBe("hard");
    expect(graded({ ...clean, hintsUsed: 3 }).grade).toBe("again");
  });

  it("caps a revealed answer at hard and weakens its evidence", () => {
    const revealed = graded({ ...clean, revealedAfterMs: 6_000 });
    expect(revealed.grade).toBe("hard");
    expect(revealed.rationale).toContain("hifz.grade.answer_revealed");
    expect(revealed.evidenceStrength).toBeLessThan(graded(clean).evidenceStrength);
  });

  it("treats an instant reveal as giving up", () => {
    const result = graded({ ...clean, revealedAfterMs: 200 });
    expect(result.grade).toBe("again");
    expect(result.rationale).toContain("hifz.grade.revealed_immediately");
  });

  it("grades partial production by how much came back", () => {
    expect(graded({ ...clean, producedWordCount: 4 }).grade).toBe("good");
    expect(graded({ ...clean, producedWordCount: 3 }).grade).toBe("hard");
    expect(graded({ ...clean, producedWordCount: 2 }).grade).toBe("again");
  });
});

describe("gradeAttempt — rebuild", () => {
  const clean: AttemptEvidence = {
    exercise: "rebuild",
    placements: placements([true, true, true, true, true]),
    rescrambles: 0,
    elapsedMs: 8_000,
  };

  it("never reaches easy: every word was on screen", () => {
    expect(graded(clean).grade).toBe("good");
    expect(graded(clean).rationale).toContain("hifz.grade.capped_by_exercise.rebuild");
  });

  it("downgrades once past one rescramble per placement", () => {
    const churned = graded({ ...clean, rescrambles: 8 });
    expect(churned.grade).toBe("hard");
    expect(churned.rationale).toContain("hifz.grade.rescramble_churn");
  });

  it("downgrades further as the churn grows", () => {
    expect(graded({ ...clean, rescrambles: 12 }).grade).toBe("again");
  });

  it("does not punish a rescramble count inside the allowance", () => {
    expect(graded({ ...clean, rescrambles: 5 }).grade).toBe("good");
  });

  it("downgrades a laboured rebuild", () => {
    const slow = graded({ ...clean, elapsedMs: 60_000 });
    expect(slow.rationale).toContain("hifz.grade.rebuild_laboured");
    expect(slow.grade).toBe("hard");
  });

  it("grades a partly wrong ordering below a clean one", () => {
    const partial = graded({
      ...clean,
      placements: placements([true, true, true, false, false]),
    });
    expect(partial.grade).toBe("again");
  });
});

describe("gradeAttempt — gap fill, cue and chain", () => {
  it("rewards gaps filled first time and punishes repeated guessing", () => {
    const first = graded({
      exercise: "gap_fill",
      gaps: [
        { wordIndex: 1, correct: true, attempts: 1 },
        { wordIndex: 4, correct: true, attempts: 1 },
      ],
    });
    expect(first.grade).toBe("easy");

    const guessed = graded({
      exercise: "gap_fill",
      gaps: [
        { wordIndex: 1, correct: true, attempts: 3 },
        { wordIndex: 4, correct: true, attempts: 3 },
      ],
    });
    expect(guessed.grade).toBe("hard");
    expect(guessed.rationale).toContain("hifz.grade.gap_fill_repeated_attempts");
  });

  it("downgrades a cue as its latency grows", () => {
    const cue = (latencyMs: number): AttemptEvidence => ({
      exercise: "next_ayah_cue",
      cueAyah: "t:2:255>2:256",
      producedFirstWords: true,
      latencyMs,
      hintsUsed: 0,
    });
    expect(graded(cue(1_200)).grade).toBe("easy");
    expect(graded(cue(4_000)).grade).toBe("good");
    expect(graded(cue(8_000)).grade).toBe("hard");
    expect(graded(cue(20_000)).grade).toBe("again");
    expect(graded(cue(4_000)).rationale).toContain("hifz.grade.cue_slow");
  });

  it("fails a cue that produced nothing", () => {
    const result = graded({
      exercise: "next_ayah_cue",
      cueAyah: "2:255",
      producedFirstWords: false,
      latencyMs: 800,
      hintsUsed: 0,
    });
    expect(result.grade).toBe("again");
    expect(result.evidenceStrength).toBe(0);
  });

  it("downgrades a chain for every break", () => {
    const chain = (produced: number, breaks: readonly number[]): AttemptEvidence => ({
      exercise: "connect_chain",
      ayahsRequested: 5,
      ayahsProducedInOrder: produced,
      breaks,
    });
    expect(graded(chain(5, [])).grade).toBe("easy");
    expect(graded(chain(5, [2])).grade).toBe("hard");
    expect(graded(chain(5, [2, 3])).grade).toBe("again");
    expect(graded(chain(3, [])).grade).toBe("hard");
  });
});

describe("gradeAttempt — support on screen caps the grade", () => {
  const clean: AttemptEvidence = {
    exercise: "recall_first",
    producedWordCount: 4,
    expectedWordCount: 4,
    revealedAfterMs: null,
    hintsUsed: 0,
  };

  it("caps a recall made with the full text visible", () => {
    const result = graded(clean);
    const withText = gradeAttempt(clean, { scaffold: "full_text" });
    expect(result.grade).toBe("easy");
    if (withText.kind !== "graded") throw new Error("expected a grade");
    expect(withText.grade).toBe("hard");
    expect(withText.rationale).toContain("hifz.grade.capped_by_scaffold.full_text");
    expect(withText.evidenceStrength).toBeLessThan(result.evidenceStrength);
  });

  it("leaves a recall from blank uncapped", () => {
    const fromBlank = gradeAttempt(clean, { scaffold: "blank" });
    if (fromBlank.kind !== "graded") throw new Error("expected a grade");
    expect(fromBlank.grade).toBe("easy");
  });
});

describe("gradeAttempt — insufficient evidence is an answer, not a default grade", () => {
  const cases: readonly (readonly [string, AttemptEvidence, string])[] = [
    [
      "a listen with no clip duration",
      { exercise: "listen", playedMs: 500, ayahDurationMs: 0, replays: 0 },
      "ayahDurationMs",
    ],
    [
      "a recall with nothing expected",
      {
        exercise: "recall_first",
        producedWordCount: 0,
        expectedWordCount: 0,
        revealedAfterMs: null,
        hintsUsed: 0,
      },
      "expectedWordCount",
    ],
    [
      "a non-finite hint count",
      {
        exercise: "recall_first",
        producedWordCount: 1,
        expectedWordCount: 4,
        revealedAfterMs: null,
        hintsUsed: Number.NaN,
      },
      "hintsUsed",
    ],
    [
      "a rebuild with no placements",
      { exercise: "rebuild", placements: [], rescrambles: 0, elapsedMs: 100 },
      "placements",
    ],
    [
      "a rebuild with duplicated slots",
      {
        exercise: "rebuild",
        placements: [
          { index: 1, correct: true },
          { index: 1, correct: false },
        ],
        rescrambles: 0,
        elapsedMs: 100,
      },
      "placements",
    ],
    ["a gap fill with no gaps", { exercise: "gap_fill", gaps: [] }, "gaps"],
    [
      "a gap filled correctly without being attempted",
      { exercise: "gap_fill", gaps: [{ wordIndex: 2, correct: true, attempts: 0 }] },
      "gaps",
    ],
    [
      "a chain claiming more āyāt than were asked for",
      { exercise: "connect_chain", ayahsRequested: 3, ayahsProducedInOrder: 9, breaks: [] },
      "ayahsProducedInOrder",
    ],
    [
      "a break outside the chain",
      { exercise: "connect_chain", ayahsRequested: 3, ayahsProducedInOrder: 3, breaks: [7] },
      "breaks",
    ],
  ];

  for (const [name, evidence, field] of cases) {
    it(`returns insufficient_evidence for ${name}`, () => {
      const result = gradeAttempt(evidence);
      expect(result.kind).toBe("insufficient_evidence");
      if (result.kind !== "insufficient_evidence") return;
      expect(result.missing).toContain(field);
    });
  }

  it("rejects a cue reference that is not an ASCII reference", () => {
    const result = gradeAttempt({
      exercise: "next_ayah_cue",
      // A cue must be a reference. Text of any kind is refused at the gate.
      cueAyah: "some free text",
      producedFirstWords: true,
      latencyMs: 900,
      hintsUsed: 0,
    });
    expect(result.kind).toBe("insufficient_evidence");
    if (result.kind !== "insufficient_evidence") return;
    expect(result.missing).toContain("cueAyah");
  });

  it("never turns unusable observations into a failure", () => {
    const result = gradeAttempt({
      exercise: "listen",
      playedMs: Number.NaN,
      ayahDurationMs: 1_000,
      replays: 0,
    });
    expect(result.kind).not.toBe("graded");
  });
});

describe("grading helpers", () => {
  it("floors downgrades at again and caps at the lower grade", () => {
    expect(downgrade("easy", 10)).toBe("again");
    expect(downgrade("good", 0)).toBe("good");
    expect(capGrade("easy", "hard")).toBe("hard");
    expect(capGrade("again", "good")).toBe("again");
  });

  it("hands the scheduler evidence only for an actual grade", () => {
    const at = new Date("2026-03-01T09:00:00Z");
    const oral = gradeAttempt({
      exercise: "oral_recitation",
      recordedMs: 5_000,
      expectedWordCount: 10,
      advisoryMatchRate: null,
    });
    expect(reviewEvidenceOf("oral_recitation", oral, at)).toBeNull();

    const listen = gradeAttempt({
      exercise: "listen",
      playedMs: 5_000,
      ayahDurationMs: 5_000,
      replays: 0,
    });
    expect(reviewEvidenceOf("listen", listen, at)).toEqual({
      grade: "hard",
      retrievalType: "listen",
      at,
    });
  });

  it("counts a pass as anything but again", () => {
    expect(isPass({ kind: "graded", grade: "hard", evidenceStrength: 0.1, rationale: [] })).toBe(true);
    expect(isPass({ kind: "graded", grade: "again", evidenceStrength: 0, rationale: [] })).toBe(false);
    expect(isPass({ kind: "requires_human", reason: "x" })).toBe(false);
  });

  it("keeps thresholds ordered so the bands cannot invert", () => {
    const { recallFirst, cue, chain } = DEFAULT_GRADING_THRESHOLDS;
    expect(recallFirst.complete).toBeGreaterThan(recallFirst.good);
    expect(recallFirst.good).toBeGreaterThan(recallFirst.hard);
    expect(cue.easyMs).toBeLessThan(cue.goodMs);
    expect(cue.goodMs).toBeLessThan(cue.hardMs);
    expect(chain.good).toBeGreaterThan(chain.hard);
  });
});
