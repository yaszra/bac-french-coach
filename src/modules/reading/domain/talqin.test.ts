import { describe, expect, it } from "vitest";

import {
  TALQIN_PRECEDENCE,
  TALQIN_PROVENANCES,
  TALQIN_SOURCES,
  isMachineVoice,
  resolveTalqin,
  talqinProvenanceLabelKey,
  type TalqinAsset,
  type TalqinProvenance,
} from "./talqin";

const CONCEPT = "letter.qaf";
const AT = new Date("2026-03-01T09:00:00.000Z");
const DAY = 86_400_000;

const teacherAsset: TalqinAsset = {
  assetId: "a-teacher",
  conceptId: CONCEPT,
  source: "teacher",
  recordedAt: AT,
  durationMs: 1400,
  teacherId: "t-1",
  provenance: "human",
  recordedByPersonId: "t-1",
};

const studioHumanAsset: TalqinAsset = {
  assetId: "a-studio-human",
  conceptId: CONCEPT,
  source: "studio",
  recordedAt: AT,
  durationMs: 1500,
  provenance: "human",
  recordedByPersonId: "qari-9",
};

const studioSynthAsset: TalqinAsset = {
  assetId: "a-studio-synth",
  conceptId: CONCEPT,
  source: "studio",
  recordedAt: new Date(AT.getTime() + DAY),
  durationMs: 1500,
  provenance: "studio_synth_reviewed",
  reviewedByPersonId: "reviewer-3",
  reviewedAt: new Date(AT.getTime() + 2 * DAY),
};

const libraryAsset: TalqinAsset = {
  assetId: "a-library",
  conceptId: CONCEPT,
  source: "library",
  recordedAt: AT,
  durationMs: 1600,
  provenance: "library",
  libraryId: "lib-1",
  reciterId: "reciter-2",
};

describe("precedence", () => {
  it("walks teacher → studio → library", () => {
    expect(TALQIN_PRECEDENCE).toEqual(["teacher", "studio", "library"]);
    expect([...TALQIN_SOURCES]).toEqual([...TALQIN_PRECEDENCE]);
  });

  it("prefers the learner's teacher over everything else", () => {
    const result = resolveTalqin({ conceptId: CONCEPT }, [
      libraryAsset,
      studioSynthAsset,
      teacherAsset,
    ]);
    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.source).toBe("teacher");
    expect(result.asset.assetId).toBe("a-teacher");
    expect(result.searched).toEqual(["teacher"]);
  });

  it("falls to the studio when no teacher has recorded one", () => {
    const result = resolveTalqin({ conceptId: CONCEPT }, [libraryAsset, studioHumanAsset]);
    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.source).toBe("studio");
    expect(result.searched).toEqual(["teacher", "studio"]);
  });

  it("falls to the library when neither teacher nor studio has one", () => {
    const result = resolveTalqin({ conceptId: CONCEPT }, [libraryAsset]);
    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.source).toBe("library");
    expect(result.searched).toEqual(["teacher", "studio", "library"]);
  });

  it("does not treat another teacher's recording as this learner's teacher", () => {
    const otherTeacher: TalqinAsset = { ...teacherAsset, assetId: "a-other", teacherId: "t-2" };
    const result = resolveTalqin({ conceptId: CONCEPT, teacherId: "t-1" }, [
      otherTeacher,
      studioHumanAsset,
    ]);
    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.source).toBe("studio");
  });

  it("ignores assets recorded for another concept", () => {
    const elsewhere: TalqinAsset = { ...teacherAsset, conceptId: "letter.kaf" };
    const result = resolveTalqin({ conceptId: CONCEPT }, [elsewhere]);
    expect(result.kind).toBe("not_yet_recorded");
  });
});

describe("not yet recorded is the floor — never a machine voice", () => {
  it("returns not_yet_recorded when nothing exists at all", () => {
    const result = resolveTalqin({ conceptId: CONCEPT }, []);
    expect(result.kind).toBe("not_yet_recorded");
    if (result.kind !== "not_yet_recorded") return;
    expect(result.conceptId).toBe(CONCEPT);
    expect(result.searched).toEqual(["teacher", "studio", "library"]);
    expect(result.reason.key).toBe("reading.talqin.reason.not_yet_recorded");
  });

  it("returns not_yet_recorded rather than substituting a synthesized voice", () => {
    // A tenant that forbids synthesized audio gets silence, not a stand-in.
    const result = resolveTalqin(
      { conceptId: CONCEPT, allowedProvenance: ["human", "library"] },
      [studioSynthAsset],
    );
    expect(result.kind).toBe("not_yet_recorded");
  });

  it("never invents an asset that was not handed in", () => {
    for (const provenance of TALQIN_PROVENANCES) {
      const result = resolveTalqin({ conceptId: CONCEPT, allowedProvenance: [provenance] }, []);
      expect(result.kind).toBe("not_yet_recorded");
    }
  });
});

describe("every returned asset is labelled", () => {
  it("carries a provenance, a machine-voice flag and a label key on resolution", () => {
    for (const asset of [teacherAsset, studioHumanAsset, studioSynthAsset, libraryAsset]) {
      const result = resolveTalqin({ conceptId: CONCEPT }, [asset]);
      expect(result.kind).toBe("resolved");
      if (result.kind !== "resolved") continue;
      expect(TALQIN_PROVENANCES).toContain(result.provenance);
      expect(result.provenance).toBe(result.asset.provenance);
      expect(result.provenanceLabelKey).toBe(talqinProvenanceLabelKey(result.provenance));
      expect(result.provenanceLabelKey).toMatch(/^reading\.talqin\.provenance\./);
      expect(result.isMachineVoice).toBe(isMachineVoice(result.asset));
    }
  });

  it("labels a synthesized model as such, and names who reviewed it", () => {
    const result = resolveTalqin({ conceptId: CONCEPT }, [studioSynthAsset]);
    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    expect(result.isMachineVoice).toBe(true);
    expect(result.provenance).toBe("studio_synth_reviewed");
    if (result.asset.provenance !== "studio_synth_reviewed") throw new Error("unreachable");
    // The type demands both, so the assertion is really a check on the fixture.
    expect(result.asset.reviewedByPersonId).toBe("reviewer-3");
    expect(result.asset.reviewedAt).toBeInstanceOf(Date);
  });

  it("has no unlabelled path — every provenance in the union has its own key", () => {
    const keys = TALQIN_PROVENANCES.map((provenance: TalqinProvenance) =>
      talqinProvenanceLabelKey(provenance),
    );
    expect(new Set(keys).size).toBe(TALQIN_PROVENANCES.length);
    for (const key of keys) {
      expect(key.length).toBeGreaterThan(0);
      expect(key).toMatch(/^[a-z][a-z0-9]*(?:[._][a-z0-9]+)+$/);
    }
    // A human voice is never mislabelled as a machine one, and vice versa.
    expect(isMachineVoice(teacherAsset)).toBe(false);
    expect(isMachineVoice(libraryAsset)).toBe(false);
    expect(isMachineVoice(studioSynthAsset)).toBe(true);
  });
});

describe("choosing between candidates", () => {
  it("prefers an exact locale match, then the newest, then the lowest id", () => {
    const older: TalqinAsset = { ...libraryAsset, assetId: "a-1", recordedAt: AT };
    const newer: TalqinAsset = {
      ...libraryAsset,
      assetId: "a-2",
      recordedAt: new Date(AT.getTime() + DAY),
    };
    const sameTime: TalqinAsset = {
      ...libraryAsset,
      assetId: "a-0",
      recordedAt: new Date(AT.getTime() + DAY),
    };
    const byRecency = resolveTalqin({ conceptId: CONCEPT }, [older, newer]);
    expect(byRecency.kind === "resolved" && byRecency.asset.assetId).toBe("a-2");

    const byId = resolveTalqin({ conceptId: CONCEPT }, [newer, sameTime]);
    expect(byId.kind === "resolved" && byId.asset.assetId).toBe("a-0");

    const localised: TalqinAsset = { ...older, assetId: "a-ar", locale: "ar" };
    const byLocale = resolveTalqin({ conceptId: CONCEPT, locale: "ar" }, [newer, localised]);
    expect(byLocale.kind === "resolved" && byLocale.asset.assetId).toBe("a-ar");
  });

  it("skips an asset recorded in a locale the request did not ask for", () => {
    const french: TalqinAsset = { ...libraryAsset, assetId: "a-fr", locale: "fr" };
    const result = resolveTalqin({ conceptId: CONCEPT, locale: "ar" }, [french]);
    expect(result.kind).toBe("not_yet_recorded");
  });

  it("is deterministic across repeated calls with the same inputs", () => {
    const available = [libraryAsset, studioSynthAsset, studioHumanAsset, teacherAsset];
    const first = resolveTalqin({ conceptId: CONCEPT }, available);
    expect(resolveTalqin({ conceptId: CONCEPT }, available)).toEqual(first);
    expect(resolveTalqin({ conceptId: CONCEPT }, [...available].reverse())).toEqual(first);
  });
});
