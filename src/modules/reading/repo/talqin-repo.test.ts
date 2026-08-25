import { describe, expect, it } from "vitest";

import { resolveTalqin } from "../domain/talqin";
import { parseTalqinKey, talqinSrc, toTalqinAsset } from "./talqin-repo";

const AT = new Date("2026-04-01T10:00:00.000Z");

const base = {
  id: "asset-1",
  objectKey: "talqin/teacher/letter.qaf/abc.mp3",
  provenance: "human",
  durationMs: 1400,
  createdAt: AT,
  reciterId: null,
  narratorId: "person-1",
  reviewedBy: null,
  reviewedAt: null,
};

describe("an object key is how audio says which concept it belongs to", () => {
  it("reads the source and the concept", () => {
    expect(parseTalqinKey("talqin/teacher/letter.qaf/abc.mp3")).toEqual({
      source: "teacher",
      conceptId: "letter.qaf",
    });
    expect(parseTalqinKey("talqin/studio/letter.beh.fathah")).toEqual({
      source: "studio",
      conceptId: "letter.beh.fathah",
    });
  });

  it("ignores a key that is not talqīn at all", () => {
    expect(parseTalqinKey("audio/husary/2/255.mp3")).toBeNull();
    expect(parseTalqinKey("talqin/letter.qaf.mp3")).toBeNull();
    expect(parseTalqinKey("talqin/somewhere/letter.qaf")).toBeNull();
  });

  it("ignores a key carrying Arabic instead of a concept id", () => {
    expect(parseTalqinKey("talqin/teacher/ق")).toBeNull();
  });

  it("serves bytes through the media route, never through a payload", () => {
    expect(talqinSrc("talqin/teacher/letter.qaf/abc.mp3")).toBe(
      "/api/audio/talqin%2Fteacher%2Fletter.qaf%2Fabc.mp3",
    );
  });
});

describe("audio that nobody signed cannot reach a learner", () => {
  it("builds a human recording with the person who made it", () => {
    const asset = toTalqinAsset(base);
    expect(asset?.provenance).toBe("human");
    expect(asset?.source).toBe("teacher");
    expect(asset?.teacherId).toBe("person-1");
  });

  it("refuses a human recording with no named person", () => {
    expect(toTalqinAsset({ ...base, narratorId: null })).toBeNull();
  });

  it("refuses synthesized audio that no person reviewed", () => {
    const synth = { ...base, provenance: "studio_synth", objectKey: "talqin/studio/letter.qaf" };
    expect(toTalqinAsset(synth)).toBeNull();
    expect(toTalqinAsset({ ...synth, reviewedBy: "person-2" })).toBeNull();
    expect(toTalqinAsset({ ...synth, reviewedBy: "person-2", reviewedAt: AT })?.provenance).toBe(
      "studio_synth_reviewed",
    );
  });

  it("refuses library audio with no named reciter", () => {
    const library = { ...base, provenance: "library", objectKey: "talqin/library/letter.qaf" };
    expect(toTalqinAsset(library)).toBeNull();
    expect(toTalqinAsset({ ...library, reciterId: "husary" })?.provenance).toBe("library");
  });

  it("refuses a provenance the platform does not recognise", () => {
    expect(toTalqinAsset({ ...base, provenance: "unknown" })).toBeNull();
  });
});

describe("resolution, end to end", () => {
  it("prefers a teacher's recording over the library", () => {
    const teacher = toTalqinAsset(base);
    const library = toTalqinAsset({
      ...base,
      id: "asset-2",
      objectKey: "talqin/library/letter.qaf",
      provenance: "library",
      reciterId: "husary",
    });
    const resolution = resolveTalqin({ conceptId: "letter.qaf" }, [library!, teacher!]);
    expect(resolution.kind).toBe("resolved");
    if (resolution.kind === "resolved") {
      expect(resolution.source).toBe("teacher");
      expect(resolution.isMachineVoice).toBe(false);
      expect(resolution.provenanceLabelKey).toBe("reading.talqin.provenance.human");
    }
  });

  it("says not yet recorded rather than substituting anything", () => {
    const resolution = resolveTalqin({ conceptId: "letter.qaf" }, []);
    expect(resolution.kind).toBe("not_yet_recorded");
    if (resolution.kind === "not_yet_recorded") {
      expect(resolution.searched).toEqual(["teacher", "studio", "library"]);
    }
  });

  it("labels a reviewed machine voice as a machine voice", () => {
    const synth = toTalqinAsset({
      ...base,
      objectKey: "talqin/studio/letter.qaf",
      provenance: "studio_synth",
      reviewedBy: "person-2",
      reviewedAt: AT,
    });
    const resolution = resolveTalqin({ conceptId: "letter.qaf" }, [synth!]);
    expect(resolution.kind === "resolved" && resolution.isMachineVoice).toBe(true);
  });
});
