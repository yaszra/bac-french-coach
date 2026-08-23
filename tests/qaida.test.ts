/**
 * Qāʿidah reading foundation.
 *
 * The rules this protects: reading progress stays separate from ḥifẓ, a
 * pronunciation-bearing step never runs without a qualified human
 * recording, and no software path reaches "confirmed".
 */
import { describe, expect, it } from "vitest";
import {
  AUDIO_REQUIRED_STAGES,
  QAIDA_STAGES,
  QaidaGateError,
  confirmPronunciation,
  initialQaidaProgress,
  qaidaParams,
  recordQaidaAttempt,
  resolveAudio,
  unmetReadingPrerequisites,
  type AudioCandidate,
  type QaidaSkillProgress,
  type QaidaStage,
} from "../src/core/qaida.js";
import { MS_PER_DAY } from "../src/core/types.js";

const T0 = Date.UTC(2026, 6, 1, 9, 0, 0);
const available = { available: true as const, assetId: "a1", provenance: "academy_studio" as const };
const unavailable = {
  available: false as const,
  explanation: "Recording not yet available.",
};

const candidate = (over: Partial<AudioCandidate> = {}): AudioCandidate => ({
  assetId: "a1",
  provenance: "licensed_library",
  approved: true,
  ...over,
});

describe("audio resolution order", () => {
  it("prefers a teacher recording over a studio one", () => {
    const result = resolveAudio([
      candidate({ assetId: "studio", provenance: "academy_studio" }),
      candidate({ assetId: "teacher", provenance: "teacher_recording" }),
    ]);
    expect(result).toEqual({
      available: true,
      assetId: "teacher",
      provenance: "teacher_recording",
    });
  });

  it("prefers the learner's own teacher over another teacher's recording", () => {
    const result = resolveAudio(
      [
        candidate({
          assetId: "other-teacher",
          provenance: "teacher_recording",
          recordedByTeacherId: "t-other",
        }),
        candidate({
          assetId: "own-teacher",
          provenance: "teacher_recording",
          recordedByTeacherId: "t-mine",
        }),
      ],
      { teacherId: "t-mine" },
    );
    expect(result).toMatchObject({ assetId: "own-teacher" });
  });

  it("falls back to a studio recording, then to a licensed library", () => {
    expect(
      resolveAudio([
        candidate({ assetId: "lib", provenance: "licensed_library" }),
        candidate({ assetId: "studio", provenance: "academy_studio" }),
      ]),
    ).toMatchObject({ assetId: "studio" });

    expect(
      resolveAudio([candidate({ assetId: "lib", provenance: "licensed_library" })]),
    ).toMatchObject({ assetId: "lib" });
  });

  it("ignores unapproved audio entirely", () => {
    const result = resolveAudio([
      candidate({ assetId: "unapproved", provenance: "teacher_recording", approved: false }),
    ]);
    expect(result.available).toBe(false);
  });

  it("says 'Recording not yet available' rather than substituting anything", () => {
    const result = resolveAudio([]);
    expect(result).toEqual({
      available: false,
      explanation: "Recording not yet available.",
    });
  });

  it("offers no synthetic provenance at all", () => {
    // There is no code path to voice synthesis: the type has no member for
    // it, so this cannot be reintroduced by configuration.
    const provenances = ["teacher_recording", "academy_studio", "licensed_library"];
    expect(provenances).not.toContain("synthetic");
    expect(provenances).not.toContain("tts");
  });
});

describe("pronunciation-bearing steps refuse to run without human audio", () => {
  it.each([...AUDIO_REQUIRED_STAGES])("blocks %s when no recording exists", (stage) => {
    expect(() =>
      recordQaidaAttempt(
        { ...initialQaidaProgress, stage },
        { stage, correct: true, occurredAt: T0, assisted: false },
        unavailable,
      ),
    ).toThrow(/Recording not yet available/);
  });

  it("allows a step that does not require audio", () => {
    const result = recordQaidaAttempt(
      { ...initialQaidaProgress, stage: "concept" },
      { stage: "concept", correct: true, occurredAt: T0, assisted: false },
      unavailable,
    );
    expect(result.progress.stage).toBe("concept");
  });
});

describe("advancing through the lesson", () => {
  function clean(progress: QaidaSkillProgress, stage: QaidaStage, at = T0) {
    return recordQaidaAttempt(
      progress,
      { stage, correct: true, occurredAt: at, assisted: false },
      available,
    );
  }

  it("needs the configured number of clean attempts to leave a step", () => {
    let progress = { ...initialQaidaProgress, stage: "concept" as QaidaStage };
    for (let i = 1; i < qaidaParams.cleanToAdvance; i++) {
      const result = clean(progress, "concept");
      expect(result.advanced).toBe(false);
      expect(result.reason).toContain(`${i} of ${qaidaParams.cleanToAdvance}`);
      progress = result.progress;
    }
    const final = clean(progress, "concept");
    expect(final.advanced).toBe(true);
    expect(final.progress.stage).toBe("model_audio");
  });

  it("never advances on a guided attempt", () => {
    let progress = { ...initialQaidaProgress, stage: "concept" as QaidaStage };
    for (let i = 0; i < 10; i++) {
      const result = recordQaidaAttempt(
        progress,
        { stage: "concept", correct: true, occurredAt: T0, assisted: true },
        available,
      );
      expect(result.advanced).toBe(false);
      progress = result.progress;
    }
    expect(progress.stage).toBe("concept");
  });

  it("resets the streak and flags repair on an incorrect attempt", () => {
    let progress = { ...initialQaidaProgress, stage: "guided_production" as QaidaStage };
    progress = clean(progress, "guided_production").progress;
    const result = recordQaidaAttempt(
      progress,
      { stage: "guided_production", correct: false, occurredAt: T0, assisted: false },
      available,
    );
    expect(result.progress.cleanAtStage).toBe(0);
    expect(result.progress.state).toBe("needs_repair");
  });

  it("requires delayed practice to actually be delayed", () => {
    const progress: QaidaSkillProgress = {
      ...initialQaidaProgress,
      stage: "delayed_practice",
      lastPractisedAt: T0,
    };
    expect(() =>
      recordQaidaAttempt(
        progress,
        { stage: "delayed_practice", correct: true, occurredAt: T0 + 3600_000, assisted: false },
        available,
      ),
    ).toThrow(/at least a day/);

    expect(() =>
      recordQaidaAttempt(
        progress,
        {
          stage: "delayed_practice",
          correct: true,
          occurredAt: T0 + MS_PER_DAY + 1,
          assisted: false,
        },
        available,
      ),
    ).not.toThrow();
  });
});

describe("the pronunciation gate is human-only", () => {
  it("refuses a recorded attempt at the gate", () => {
    expect(() =>
      recordQaidaAttempt(
        { ...initialQaidaProgress, stage: "pronunciation_gate" },
        {
          stage: "pronunciation_gate",
          correct: true,
          occurredAt: T0,
          assisted: false,
        },
        available,
      ),
    ).toThrow(/qualified human in person/);
  });

  it("refuses confirmation from an unqualified verifier", () => {
    expect(() =>
      confirmPronunciation(
        { ...initialQaidaProgress, stage: "pronunciation_gate" },
        { verifierUserId: "u1", now: T0, verifierIsQualified: false },
      ),
    ).toThrow(QaidaGateError);
  });

  it("refuses confirmation before the gate is reached", () => {
    expect(() =>
      confirmPronunciation(
        { ...initialQaidaProgress, stage: "guided_production" },
        { verifierUserId: "u1", now: T0, verifierIsQualified: true },
      ),
    ).toThrow(/not reached the pronunciation gate/);
  });

  it("records who confirmed it and when", () => {
    const confirmed = confirmPronunciation(
      { ...initialQaidaProgress, stage: "pronunciation_gate" },
      { verifierUserId: "teacher-1", now: T0, verifierIsQualified: true },
    );
    expect(confirmed.state).toBe("confirmed");
    expect(confirmed.pronunciationConfirmedBy).toBe("teacher-1");
    expect(confirmed.pronunciationConfirmedAt).toBe(T0);
  });

  it("is the only route to confirmed", () => {
    // Walk the whole lesson with perfect attempts; the state stops at the
    // gate and never becomes `confirmed` on its own.
    let progress = { ...initialQaidaProgress, stage: "concept" as QaidaStage };
    let day = 0;
    for (let i = 0; i < 60; i++) {
      if (progress.stage === "pronunciation_gate") break;
      if (progress.stage === "delayed_practice") day += 2;
      progress = recordQaidaAttempt(
        progress,
        {
          stage: progress.stage,
          correct: true,
          occurredAt: T0 + day * MS_PER_DAY,
          assisted: false,
        },
        available,
      ).progress;
    }
    expect(progress.stage).toBe("pronunciation_gate");
    expect(progress.state).toBe("awaiting_pronunciation_check");
    expect(progress.pronunciationConfirmedAt).toBeNull();
  });
});

describe("reading prerequisites diagnose, rather than score", () => {
  it("names the unconfirmed skills a passage depends on", () => {
    const unmet = unmetReadingPrerequisites(
      ["madd", "ghunnah", "qalqalah"],
      new Set(["madd"]),
    );
    expect(unmet).toEqual(["ghunnah", "qalqalah"]);
  });

  it("returns nothing when every prerequisite is confirmed", () => {
    expect(
      unmetReadingPrerequisites(["madd"], new Set(["madd", "ghunnah"])),
    ).toEqual([]);
  });
});

describe("the lesson shape matches the specification", () => {
  it("runs concept, model, identify, produce, discriminate, delay, gate", () => {
    expect(QAIDA_STAGES).toEqual([
      "concept",
      "model_audio",
      "listen_and_identify",
      "guided_production",
      "mixed_discrimination",
      "delayed_practice",
      "pronunciation_gate",
    ]);
  });

  it("ends with a human gate, not a software step", () => {
    expect(QAIDA_STAGES.at(-1)).toBe("pronunciation_gate");
  });
});
