import { describe, expect, it } from "vitest";
import { unitsInScope, unitsWithinScope } from "./scope";

describe("the units a verdict may decide", () => {
  it("covers the passage that was asked about, and the seams inside it", () => {
    const units = unitsInScope({ sura: 78, ayahFrom: 1, ayahTo: 3 });
    expect(units).not.toBeNull();
    expect([...units!].sort()).toEqual(
      ["b:78:1", "b:78:2", "b:78:3", "t:78:1>78:2", "t:78:2>78:3"].sort(),
    );
  });

  it("covers a reading gate's single concept", () => {
    expect([...unitsInScope({ lessonId: "l1", unitId: "c:letter.beh" })!]).toEqual(["c:letter.beh"]);
  });

  it("accepts a verdict on part of the passage", () => {
    // Hearing three āyahs of five and saying so is honest.
    expect(unitsWithinScope(["b:78:1", "b:78:2"], { sura: 78, ayahFrom: 1, ayahTo: 5 })).toEqual([
      "b:78:1",
      "b:78:2",
    ]);
  });

  it("refuses a unit nobody was asked to recite", () => {
    /* The defect this exists for: the verdict path took the client's unit ids
       and marked them verified, without ever reading what the request was
       about. A verifier could mark any unit at all verified for that learner,
       and the history would say a person had listened to it. */
    expect(unitsWithinScope(["b:2:255"], { sura: 78, ayahFrom: 1, ayahTo: 5 })).toBeNull();
    expect(
      unitsWithinScope(["b:78:1", "b:114:1"], { sura: 78, ayahFrom: 1, ayahTo: 5 }),
    ).toBeNull();
  });

  it("refuses a scope it cannot read, rather than allowing everything", () => {
    for (const scope of [null, undefined, 42, [], {}, { sura: 78 }, { sura: 78, ayahFrom: 5, ayahTo: 1 }]) {
      expect(unitsInScope(scope)).toBeNull();
      expect(unitsWithinScope(["b:78:1"], scope)).toBeNull();
    }
  });

  it("allows a whole long sūrah, and refuses a range no muṣḥaf contains", () => {
    // Al-Baqarah is 286 āyahs. A ḥāfiẓ reciting it in one sitting is a real
    // thing, so the cap is above it — it exists to refuse a malformed range,
    // not to decide how much someone may recite.
    expect(unitsInScope({ sura: 2, ayahFrom: 1, ayahTo: 286 })).not.toBeNull();
    expect(unitsInScope({ sura: 2, ayahFrom: 1, ayahTo: 50_000 })).toBeNull();
  });

  it("refuses an empty verdict", () => {
    expect(unitsWithinScope([], { sura: 78, ayahFrom: 1, ayahTo: 5 })).toBeNull();
  });
});
