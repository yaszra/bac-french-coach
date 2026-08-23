import { describe, expect, it } from "vitest";

import {
  DEFAULT_MUTASHABIHAT_CONFIG,
  buildLookAlikeIndex,
  decoysFor,
  nGrams,
  similarityBetween,
  type UnitWords,
} from "./mutashabihat";

/**
 * Tokens are opaque placeholders on purpose. The engine never sees scripture: the
 * caller supplies word arrays derived from the verified corpus.
 */
function words(...tokens: readonly string[]): readonly string[] {
  return tokens;
}

const SHARED = words("w1", "w2", "w3", "w4", "w5");

const FIXTURES: readonly UnitWords[] = [
  { unitId: "b:2:1", words: words("x1", "x2", "x3", "x4", "x5", "x6") },
  { unitId: "b:2:2", words: SHARED },
  { unitId: "b:2:3", words: words("y1", "y2", "y3", "y4", "y5", "y6") },
  // Near-identical to b:2:2 but far away in the sequence: the classic mutashābih trap.
  { unitId: "b:2:4", words: words("w1", "w2", "w3", "w4", "w9") },
  { unitId: "b:2:5", words: words("z1", "z2", "z3", "z4", "z5") },
  { unitId: "b:2:6", words: words("w1", "w2", "w3", "w4", "w5", "w6") },
];

describe("nGrams", () => {
  it("slides a window of n words and de-duplicates", () => {
    expect(nGrams(words("a", "b", "c", "d"), 2)).toEqual(["a b", "b c", "c d"]);
    expect(nGrams(words("a", "a", "a"), 2)).toEqual(["a a"]);
  });

  it("falls back to the whole sequence for units shorter than n", () => {
    expect(nGrams(words("a", "b"), 4)).toEqual(["a b"]);
    expect(nGrams([], 4)).toEqual([]);
  });
});

describe("buildLookAlikeIndex", () => {
  it("scores genuinely overlapping units above unrelated ones", () => {
    const index = buildLookAlikeIndex(FIXTURES);
    const overlapping = similarityBetween(index, "b:2:2", "b:2:6");
    const unrelated = similarityBetween(index, "b:2:2", "b:2:3");
    expect(overlapping).toBeGreaterThan(0);
    expect(unrelated).toBe(0);
    expect(overlapping).toBeGreaterThan(unrelated);
  });

  it("ranks the closest look-alike first", () => {
    const decoys = decoysFor(buildLookAlikeIndex(FIXTURES), "b:2:2");
    expect(decoys[0]?.unitId).toBe("b:2:6");
    expect(decoys.map((decoy) => decoy.unitId)).toContain("b:2:4");
    for (let index = 1; index < decoys.length; index += 1) {
      expect(decoys[index - 1]?.score ?? 0).toBeGreaterThanOrEqual(decoys[index]?.score ?? 0);
    }
  });

  it("reports the shared n-gram count as the evidence behind each score", () => {
    const decoy = decoysFor(buildLookAlikeIndex(FIXTURES), "b:2:2").find(
      (candidate) => candidate.unitId === "b:2:6",
    );
    expect(decoy?.sharedNGrams).toBe(2);
  });

  it("never offers a unit as its own decoy", () => {
    for (const entry of buildLookAlikeIndex(FIXTURES).units) {
      expect(entry.decoys.map((decoy) => decoy.unitId)).not.toContain(entry.unitId);
    }
  });

  it("excludes immediate sequential neighbours", () => {
    const sequential: readonly UnitWords[] = [
      { unitId: "b:2:1", words: SHARED },
      { unitId: "b:2:2", words: SHARED },
      { unitId: "b:2:3", words: words("q1", "q2", "q3", "q4", "q5") },
      { unitId: "b:2:4", words: SHARED },
    ];
    const index = buildLookAlikeIndex(sequential);
    expect(decoysFor(index, "b:2:1").map((decoy) => decoy.unitId)).not.toContain("b:2:2");
    expect(decoysFor(index, "b:2:1").map((decoy) => decoy.unitId)).toContain("b:2:4");
    const wide = buildLookAlikeIndex(sequential, { sequentialNeighbourRadius: 3 });
    expect(decoysFor(wide, "b:2:1").length).toBe(0);
  });

  it("honours explicit exclusions in both directions", () => {
    const withExcludes: readonly UnitWords[] = [
      { unitId: "b:2:2", words: SHARED, excludes: ["b:2:6"] },
      { unitId: "b:2:3", words: words("y1", "y2", "y3", "y4") },
      { unitId: "b:2:6", words: words("w1", "w2", "w3", "w4", "w5", "w6") },
    ];
    const index = buildLookAlikeIndex(withExcludes);
    expect(decoysFor(index, "b:2:2").map((decoy) => decoy.unitId)).not.toContain("b:2:6");
    expect(decoysFor(index, "b:2:6").map((decoy) => decoy.unitId)).not.toContain("b:2:2");
  });

  it("is deterministic: the same corpus yields the same index", () => {
    expect(buildLookAlikeIndex(FIXTURES)).toEqual(buildLookAlikeIndex(FIXTURES));
  });

  it("keeps at most topK decoys", () => {
    const many: UnitWords[] = [];
    for (let index = 0; index < 20; index += 1) {
      many.push({ unitId: `b:3:${index + 1}`, words: words("w1", "w2", "w3", "w4", `t${index}`) });
    }
    const index = buildLookAlikeIndex(many, { topK: 3 });
    for (const entry of index.units) expect(entry.decoys.length).toBeLessThanOrEqual(3);
  });

  it("skips n-grams shared by too many units instead of comparing every pair", () => {
    const many: UnitWords[] = [];
    for (let index = 0; index < 30; index += 1) {
      many.push({ unitId: `b:4:${index + 1}`, words: words("w1", "w2", "w3", "w4", `t${index}`) });
    }
    const capped = buildLookAlikeIndex(many, { maxPostingsPerNGram: 10, sequentialNeighbourRadius: 0 });
    expect(capped.skippedNGrams).toBeGreaterThan(0);
    for (const entry of capped.units) expect(entry.decoys.length).toBe(0);
  });

  it("supports the alternative similarity metrics", () => {
    const dice = buildLookAlikeIndex(FIXTURES, { metric: "dice" });
    const jaccard = buildLookAlikeIndex(FIXTURES, { metric: "jaccard" });
    const overlap = buildLookAlikeIndex(FIXTURES, { metric: "overlap" });
    const pair = (index: ReturnType<typeof buildLookAlikeIndex>): number =>
      similarityBetween(index, "b:2:2", "b:2:6");
    expect(pair(dice)).toBeGreaterThan(pair(jaccard));
    expect(pair(overlap)).toBeGreaterThanOrEqual(pair(dice));
  });

  it("applies the configured minimum shared-n-gram floor", () => {
    const strict = buildLookAlikeIndex(FIXTURES, { minSharedNGrams: 3 });
    expect(decoysFor(strict, "b:2:2")).toEqual([]);
  });

  it("returns an empty decoy list for unknown units", () => {
    expect(decoysFor(buildLookAlikeIndex(FIXTURES), "b:9:9")).toEqual([]);
  });

  it("keeps the default configuration on the returned index", () => {
    expect(buildLookAlikeIndex(FIXTURES).config).toEqual(DEFAULT_MUTASHABIHAT_CONFIG);
  });
});
