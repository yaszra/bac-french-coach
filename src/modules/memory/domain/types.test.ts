import { describe, expect, it } from "vitest";

import { emptyState } from "./fsrs";
import {
  GRADES,
  GRADE_RATING,
  RETRIEVAL_TYPES,
  UNIT_KINDS,
  bodiesOfTransition,
  bodyUnitId,
  conceptUnitId,
  hasEvidence,
  isSuccessGrade,
  isUnitId,
  pagePositionUnitId,
  parseUnitId,
  reason,
  transitionUnitId,
  unitKindOf,
} from "./types";

describe("unit identity", () => {
  it("parses each documented id form", () => {
    expect(parseUnitId("t:2:255>2:256")).toEqual({
      kind: "ayah_transition",
      from: { surah: 2, ayah: 255 },
      to: { surah: 2, ayah: 256 },
    });
    expect(parseUnitId("b:2:255")).toEqual({ kind: "ayah_body", ayah: { surah: 2, ayah: 255 } });
    expect(parseUnitId("p:604:3")).toEqual({ kind: "page_position", page: 604, position: 3 });
    expect(parseUnitId("c:letter.baa.fathah")).toEqual({
      kind: "reading_concept",
      conceptKey: "letter.baa.fathah",
    });
  });

  it("round-trips through the constructors", () => {
    expect(bodyUnitId({ surah: 2, ayah: 255 })).toBe("b:2:255");
    expect(transitionUnitId({ surah: 2, ayah: 255 }, { surah: 2, ayah: 256 })).toBe("t:2:255>2:256");
    expect(pagePositionUnitId(604, 3)).toBe("p:604:3");
    expect(conceptUnitId("letter.baa.fathah")).toBe("c:letter.baa.fathah");
    for (const id of ["b:2:255", "t:2:255>2:256", "p:604:3", "c:letter.baa.fathah"]) {
      expect(isUnitId(id)).toBe(true);
    }
  });

  it("returns null — never throws — for malformed ids", () => {
    const malformed = [
      "",
      "b:",
      "b:0:1",
      "b:115:1",
      "b:2:0",
      "b:02:255",
      "b:2:255:1",
      "t:2:255",
      "t:2:255>",
      "t:2:255>2:256>2:257",
      "p:604",
      "p:0:1",
      "c:",
      "c:Letter.Baa",
      "c:letter..baa",
      "x:2:255",
      "just-a-string",
    ];
    for (const id of malformed) {
      expect(parseUnitId(id)).toBeNull();
      expect(isUnitId(id)).toBe(false);
      expect(unitKindOf(id)).toBeNull();
    }
  });

  it("reports the kind encoded by an id", () => {
    expect(unitKindOf("t:2:255>2:256")).toBe("ayah_transition");
    expect(unitKindOf("b:2:255")).toBe("ayah_body");
    expect(unitKindOf("p:604:3")).toBe("page_position");
    expect(unitKindOf("c:letter.baa.fathah")).toBe("reading_concept");
    expect(UNIT_KINDS).toHaveLength(4);
  });

  it("names the two āyah bodies a transition joins", () => {
    expect(bodiesOfTransition("t:2:255>2:256")).toEqual(["b:2:255", "b:2:256"]);
    expect(bodiesOfTransition("t:2:286>3:1")).toEqual(["b:2:286", "b:3:1"]);
    expect(bodiesOfTransition("b:2:255")).toBeNull();
    expect(bodiesOfTransition("nonsense")).toBeNull();
  });

  it("carries no scripture: ids are ASCII references only", () => {
    const ids = ["t:2:255>2:256", "b:2:255", "p:604:3", "c:letter.baa.fathah"];
    for (const id of ids) expect(id).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe("grades", () => {
  it("maps to the FSRS ratings 1..4 in order", () => {
    expect(GRADES.map((grade) => GRADE_RATING[grade])).toEqual([1, 2, 3, 4]);
  });

  it("treats everything except 'again' as a success", () => {
    expect(isSuccessGrade("again")).toBe(false);
    expect(isSuccessGrade("hard")).toBe(true);
    expect(isSuccessGrade("good")).toBe(true);
    expect(isSuccessGrade("easy")).toBe(true);
  });
});

describe("evidence", () => {
  it("treats an unreviewed unit as 'not yet recorded'", () => {
    const fresh = emptyState("b:2:255", "ayah_body");
    expect(hasEvidence(fresh)).toBe(false);
    expect(fresh.confidence).toBe(0);
    expect(fresh.lastReviewAt).toBeNull();
    expect(fresh.lastRetrievalType).toBeNull();
  });

  it("covers every retrieval type the products can run", () => {
    expect(new Set(RETRIEVAL_TYPES).size).toBe(RETRIEVAL_TYPES.length);
    expect(RETRIEVAL_TYPES).toContain("oral_recitation");
    expect(RETRIEVAL_TYPES).toContain("review_blank");
  });
});

describe("reason", () => {
  it("builds an i18n key with parameters and defaults to none", () => {
    expect(reason("memory.reason.due_review", { unitId: "b:2:255" })).toEqual({
      key: "memory.reason.due_review",
      params: { unitId: "b:2:255" },
    });
    expect(reason("memory.reason.due_review").params).toEqual({});
  });
});
