import { describe, expect, it } from "vitest";
import { advisoryWeakSpots, reciteDiff, type AdvisoryDiff } from "./reciteDiff";

/**
 * Placeholder tokens only. This module never sees scripture, and neither do its
 * tests: `w1`, `w2` … stand in for words, `w1_a` / `w1_u` for the same word carrying
 * different marks, and `|` for a pause marker the caller chooses to ignore.
 */
const identity = { normalize: (token: string) => token };
const stripMarks = { normalize: (token: string) => token.split("_")[0] ?? token };
const dropPauses = { normalize: (token: string) => (token === "|" ? "" : token) };

const asDiff = (value: ReturnType<typeof reciteDiff>): AdvisoryDiff => {
  if (value.kind !== "diff") throw new Error(`expected a diff, got ${value.kind}`);
  return value;
};

describe("the advisory contract", () => {
  it("carries an advisory flag on every result", () => {
    const diff = reciteDiff(["w1"], ["w1"], identity);
    expect(diff.advisory).toBe(true);
    const refused = reciteDiff(
      Array.from({ length: 600 }, (_unused, index) => `w${index}`),
      Array.from({ length: 600 }, (_unused, index) => `w${index}`),
      identity,
    );
    expect(refused.advisory).toBe(true);
    expect(refused.kind).toBe("not_compared");
  });

  it("produces no grade of any kind", () => {
    const diff = asDiff(reciteDiff(["w1", "w2"], ["w1", "w9"], identity));
    expect(Object.keys(diff)).not.toContain("grade");
    expect(Object.keys(diff)).not.toContain("score");
  });
});

describe("alignment", () => {
  it("matches an identical recitation and carries the denominator", () => {
    const diff = asDiff(reciteDiff(["w1", "w2", "w3"], ["w1", "w2", "w3"], identity));
    expect(diff.counts).toMatchObject({ match: 3, differs: 0, missing: 0, extra: 0, compared: 3 });
    expect(diff.matchRate).toEqual({ numerator: 3, denominator: 3, rate: 1 });
    expect(diff.expected.map((word) => word.status)).toEqual(["match", "match", "match"]);
  });

  it("marks a substituted word as differing", () => {
    const diff = asDiff(reciteDiff(["w1", "w2", "w3"], ["w1", "w9", "w3"], identity));
    expect(diff.expected.map((word) => word.status)).toEqual(["match", "differs", "match"]);
    expect(diff.counts.differs).toBe(1);
    expect(diff.matchRate).toEqual({ numerator: 2, denominator: 3, rate: 2 / 3 });
  });

  it("marks a skipped word as missing", () => {
    const diff = asDiff(reciteDiff(["w1", "w2", "w3"], ["w1", "w3"], identity));
    expect(diff.expected.map((word) => word.status)).toEqual(["match", "missing", "match"]);
    expect(diff.counts.missing).toBe(1);
    expect(diff.ops.filter((op) => op.kind === "missing")).toHaveLength(1);
  });

  it("marks an interpolated word as extra", () => {
    const diff = asDiff(reciteDiff(["w1", "w2"], ["w1", "w9", "w2"], identity));
    expect(diff.counts.extra).toBe(1);
    expect(diff.extras).toEqual([{ heardIndex: 1 }]);
    expect(diff.expected.map((word) => word.status)).toEqual(["match", "match"]);
  });

  it("handles a recitation that stopped early", () => {
    const diff = asDiff(reciteDiff(["w1", "w2", "w3", "w4"], ["w1", "w2"], identity));
    expect(diff.counts).toMatchObject({ match: 2, missing: 2 });
    expect(advisoryWeakSpots(diff)).toEqual([2, 3]);
  });

  it("keeps the caller's original indices through the alignment", () => {
    const diff = asDiff(reciteDiff(["w1", "w2", "w3"], ["w0", "w1", "w2", "w3"], identity));
    const matches = diff.ops.filter((op) => op.kind === "match");
    expect(matches.map((op) => op.expectedIndex)).toEqual([0, 1, 2]);
    expect(matches.map((op) => op.heardIndex)).toEqual([1, 2, 3]);
  });
});

describe("normalisation is injected, so precision and tolerance are the caller's", () => {
  it("is ḥarakah-precise when the normalizer preserves the marks", () => {
    const diff = asDiff(reciteDiff(["w1_a", "w2"], ["w1_u", "w2"], identity));
    expect(diff.expected[0]?.status).toBe("differs");
  });

  it("forgives the same difference when the normalizer strips the marks", () => {
    const diff = asDiff(reciteDiff(["w1_a", "w2"], ["w1_u", "w2"], stripMarks));
    expect(diff.expected[0]?.status).toBe("match");
    expect(diff.matchRate.rate).toBe(1);
  });

  it("is waqf-tolerant when the normalizer drops pause markers", () => {
    const strict = asDiff(reciteDiff(["w1", "|", "w2"], ["w1", "w2"], identity));
    expect(strict.counts.missing).toBe(1);

    const tolerant = asDiff(reciteDiff(["w1", "|", "w2"], ["w1", "w2"], dropPauses));
    expect(tolerant.counts.missing).toBe(0);
    expect(tolerant.expected.map((word) => word.status)).toEqual(["match", "ignored", "match"]);
    expect(tolerant.ignored).toEqual({ expected: 1, heard: 0 });
    expect(tolerant.matchRate).toEqual({ numerator: 2, denominator: 2, rate: 1 });
  });

  it("does not penalise a learner for stopping where the reciter did not", () => {
    const tolerant = asDiff(reciteDiff(["w1", "w2"], ["w1", "|", "w2"], dropPauses));
    expect(tolerant.counts.extra).toBe(0);
    expect(tolerant.ignored.heard).toBe(1);
  });
});

describe("edges", () => {
  it("reports a null rate when there is nothing to compare", () => {
    const diff = asDiff(reciteDiff([], [], identity));
    expect(diff.matchRate).toEqual({ numerator: 0, denominator: 0, rate: null });
    expect(diff.ops).toEqual([]);
  });

  it("marks everything missing when nothing was heard", () => {
    const diff = asDiff(reciteDiff(["w1", "w2"], [], identity));
    expect(diff.expected.map((word) => word.status)).toEqual(["missing", "missing"]);
    expect(diff.matchRate).toEqual({ numerator: 0, denominator: 2, rate: 0 });
  });

  it("refuses rather than hangs on an oversized comparison", () => {
    const long = Array.from({ length: 200 }, (_unused, index) => `w${index}`);
    const refused = reciteDiff(long, long, { ...identity, maxCells: 100 });
    expect(refused.kind).toBe("not_compared");
    if (refused.kind !== "not_compared") return;
    expect(refused.reason).toBe("hifz.diff.too_large");
    expect(refused.expectedTotal).toBe(200);
  });
});
