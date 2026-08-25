import { describe, expect, it } from "vitest";
import { applyVerdict, type VerdictInput } from "./verdict";
import { CORRECTIONS, isMemoryError } from "./taxonomy";

const DECIDED_AT = new Date("2026-08-23T18:30:00Z");

function verdict(over: Partial<VerdictInput> = {}): VerdictInput {
  return {
    kind: "passed",
    unitIds: ["b:78:1"],
    corrections: [],
    decidedByUserId: "u_teacher",
    decidedAt: DECIDED_AT,
    ...over,
  };
}

describe("the correction taxonomy", () => {
  it("has eleven categories in two families", () => {
    expect(CORRECTIONS).toHaveLength(11);
    expect(CORRECTIONS.filter((c) => c.family === "memory")).toHaveLength(7);
    expect(CORRECTIONS.filter((c) => c.family === "articulation")).toHaveLength(4);
  });

  it("never lets an articulation slip count as forgetting", () => {
    for (const correction of CORRECTIONS.filter((c) => c.family === "articulation")) {
      expect(correction.memoryWeight).toBe(0);
      expect(isMemoryError(correction.category)).toBe(false);
    }
  });

  it("carries no label text, only keys", () => {
    for (const correction of CORRECTIONS) {
      expect(correction.labelKey).toMatch(/^correction\./);
    }
  });
});

describe("applying a verdict", () => {
  it("gives full credit to a clean pass", () => {
    const { units } = applyVerdict(verdict());
    expect(units[0]).toMatchObject({ grade: "easy", verified: true, lapsed: false });
  });

  it("passes with less credit when there were slips, without lapsing the unit", () => {
    const { units } = applyVerdict(
      verdict({ corrections: [{ category: "hesitation", sura: 78, ayah: 1 }] }),
    );
    expect(units[0]?.grade).toBe("good");
    expect(units[0]?.verified).toBe(true);
    expect(units[0]?.lapsed).toBe(false);
  });

  it("downgrades further as slips accumulate", () => {
    const { units } = applyVerdict(
      verdict({
        corrections: [
          { category: "prompted", sura: 78, ayah: 1 },
          { category: "wrong_word", sura: 78, ayah: 1 },
        ],
      }),
    );
    expect(units[0]?.grade).toBe("hard");
  });

  it("does not lapse a unit for a tajwīd slip alone", () => {
    const { units } = applyVerdict(
      verdict({ corrections: [{ category: "madd_length", sura: 78, ayah: 1 }] }),
    );
    expect(units[0]).toMatchObject({ grade: "easy", verified: true, lapsed: false });
  });

  it("lapses on needs_work with a memory error", () => {
    const { units } = applyVerdict(
      verdict({ kind: "needs_work", corrections: [{ category: "skipped_ayah", sura: 78, ayah: 1 }] }),
    );
    expect(units[0]).toMatchObject({ grade: "again", verified: false, lapsed: true });
  });

  it("never verifies a unit that was not attempted", () => {
    const { units } = applyVerdict(verdict({ kind: "not_attempted" }));
    expect(units[0]).toMatchObject({ verified: false, lapsed: false, grade: "again" });
  });

  it("turns a wrong join into an observed mutashābih edge", () => {
    const { graphSignals } = applyVerdict(
      verdict({
        kind: "needs_work",
        corrections: [
          { category: "wrong_join", sura: 2, ayah: 61, wentTo: { sura: 3, ayah: 112 } },
        ],
      }),
    );
    expect(graphSignals).toEqual([
      { relation: "mutashabih_of", from: "b:2:61", to: "b:3:112" },
    ]);
  });

  it("spawns the drill that matches the slip, with its reason", () => {
    const { drills } = applyVerdict(
      verdict({
        kind: "needs_work",
        corrections: [
          { category: "wrong_join", sura: 2, ayah: 61, wentTo: { sura: 3, ayah: 112 } },
          { category: "skipped_word", sura: 2, ayah: 61, wordIndex: 4 },
          { category: "makhraj", sura: 2, ayah: 61, wordIndex: 2 },
        ],
      }),
    );
    expect(drills.map((d) => d.exercise)).toEqual(["next_ayah_cue", "gap_fill", "listen"]);
    for (const drill of drills) expect(drill.reasonKey).toMatch(/^drill\./);
  });

  it("always explains itself", () => {
    const { units } = applyVerdict(verdict());
    expect(units[0]?.reasons.length).toBeGreaterThan(0);
  });
});
