import { describe, expect, it } from "vitest";
import {
  anchorAyahOf,
  ayahsOfUnit,
  nextAyahInSurah,
  parseHifzScope,
  unitReferenceLabel,
  unitsOfScope,
  unitsOfScopes,
} from "./passage";

describe("the assignment scope", () => {
  it("parses a reference-only range", () => {
    expect(parseHifzScope({ sura: 78, ayahFrom: 1, ayahTo: 5 })).toEqual({
      sura: 78,
      ayahFrom: 1,
      ayahTo: 5,
    });
  });

  it("refuses a range that runs backwards", () => {
    expect(parseHifzScope({ sura: 78, ayahFrom: 5, ayahTo: 1 })).toBeNull();
  });

  it("refuses a sūrah that does not exist", () => {
    expect(parseHifzScope({ sura: 115, ayahFrom: 1, ayahTo: 2 })).toBeNull();
  });

  it("refuses a scope carrying anything extra — text can never ride in", () => {
    expect(parseHifzScope({ sura: 78, ayahFrom: 1, ayahTo: 5, text: "…" })).toBeNull();
  });

  it("refuses a reading scope it does not understand", () => {
    expect(parseHifzScope({ lessonId: "qaidah.1" })).toBeNull();
    expect(parseHifzScope(null)).toBeNull();
  });
});

describe("units of a scope", () => {
  it("puts each body before the join that leaves it", () => {
    expect(unitsOfScope({ sura: 78, ayahFrom: 1, ayahTo: 3 }).map((u) => u.unitId)).toEqual([
      "b:78:1",
      "t:78:1>78:2",
      "b:78:2",
      "t:78:2>78:3",
      "b:78:3",
    ]);
  });

  it("gives a single āyah a body and no join", () => {
    expect(unitsOfScope({ sura: 78, ayahFrom: 4, ayahTo: 4 }).map((u) => u.unitId)).toEqual(["b:78:4"]);
  });

  it("numbers the curriculum order from the start", () => {
    expect(unitsOfScope({ sura: 78, ayahFrom: 1, ayahTo: 2 }).map((u) => u.order)).toEqual([0, 1, 2]);
  });

  it("continues the order from an offset", () => {
    expect(unitsOfScope({ sura: 78, ayahFrom: 1, ayahTo: 1 }, 10)[0]?.order).toBe(10);
  });

  it("labels bodies and joins with the right kind", () => {
    const units = unitsOfScope({ sura: 78, ayahFrom: 1, ayahTo: 2 });
    expect(units.map((u) => u.kind)).toEqual(["ayah_body", "ayah_transition", "ayah_body"]);
  });

  it("deduplicates units shared by two overlapping assignments", () => {
    const units = unitsOfScopes([
      { sura: 78, ayahFrom: 1, ayahTo: 2 },
      { sura: 78, ayahFrom: 2, ayahTo: 3 },
    ]);
    const ids = units.map((u) => u.unitId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("b:78:3");
  });

  it("returns the merged units in curriculum order", () => {
    const units = unitsOfScopes([
      { sura: 78, ayahFrom: 1, ayahTo: 2 },
      { sura: 78, ayahFrom: 3, ayahTo: 3 },
    ]);
    expect(units.map((u) => u.order)).toEqual([...units].map((u) => u.order).sort((a, b) => a - b));
  });

  it("returns nothing for no scopes", () => {
    expect(unitsOfScopes([])).toEqual([]);
  });
});

describe("what a unit is about", () => {
  it("gives a body one āyah", () => {
    expect(ayahsOfUnit("b:78:1")).toEqual([{ surah: 78, ayah: 1 }]);
  });

  it("gives a join both of its ends — a seam cannot be seen from one side", () => {
    expect(ayahsOfUnit("t:78:1>78:2")).toEqual([
      { surah: 78, ayah: 1 },
      { surah: 78, ayah: 2 },
    ]);
  });

  it("refuses to guess at āyāt for a page position or a reading concept", () => {
    expect(ayahsOfUnit("p:604:3")).toEqual([]);
    expect(ayahsOfUnit("c:letter.baa.fathah")).toEqual([]);
  });

  it("returns nothing for a malformed id rather than throwing", () => {
    expect(ayahsOfUnit("nonsense")).toEqual([]);
    expect(anchorAyahOf("nonsense")).toBeNull();
  });

  it("anchors a join to its first āyah", () => {
    expect(anchorAyahOf("t:78:1>78:2")).toEqual({ surah: 78, ayah: 1 });
  });
});

describe("the reference label", () => {
  it("is digits, never Arabic", () => {
    expect(unitReferenceLabel("b:78:1")).toBe("78:1");
    expect(unitReferenceLabel("t:78:1>78:2")).toBe("78:1 → 78:2");
    expect(unitReferenceLabel("p:604:3")).toBe("604·3");
    expect(unitReferenceLabel("c:letter.baa.fathah")).toBe("letter.baa.fathah");
  });

  it("is null for a malformed id", () => {
    expect(unitReferenceLabel("b:999:0")).toBeNull();
  });
});

describe("the next āyah", () => {
  it("steps forward inside the sūrah", () => {
    expect(nextAyahInSurah({ surah: 78, ayah: 1 }, 40)).toEqual({ surah: 78, ayah: 2 });
  });

  it("stops at the end of the sūrah rather than inventing a crossing", () => {
    expect(nextAyahInSurah({ surah: 78, ayah: 40 }, 40)).toBeNull();
  });

  it("steps forward when the sūrah's length is not known", () => {
    expect(nextAyahInSurah({ surah: 78, ayah: 1 }, null)).toEqual({ surah: 78, ayah: 2 });
  });
});
