import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/modules/memory/domain/simulate";
import {
  activeWordAt,
  activeWordIndexAt,
  hasUsableTimings,
  nextBoundaryMs,
  searchTimingIndex,
  validateTimings,
  type WordTiming,
} from "./wordSync";

/** Measured boundaries for a four-word clip. Indices only — never any text. */
const timings: readonly WordTiming[] = [
  { wordIndex: 0, startMs: 0, endMs: 400 },
  { wordIndex: 1, startMs: 400, endMs: 900 },
  { wordIndex: 2, startMs: 1_000, endMs: 1_500 },
  { wordIndex: 3, startMs: 1_500, endMs: 2_000 },
];

describe("timings are measured, never invented", () => {
  it("returns no_timings for an unaligned recitation", () => {
    expect(activeWordAt([], 500)).toEqual({ kind: "no_timings" });
    expect(validateTimings([])).toEqual({ kind: "no_timings" });
    expect(activeWordIndexAt([], 500)).toBeNull();
    expect(nextBoundaryMs([], 500)).toBeNull();
  });

  it("does not interpolate a sweep from duration and word count", () => {
    // Four words over two seconds would put word 1 at 700 ms if interpolated.
    expect(activeWordAt([], 700)).toEqual({ kind: "no_timings" });
  });
});

describe("validateTimings", () => {
  it("accepts a well-formed set and reports what it covers", () => {
    const result = validateTimings(timings, { ayahDurationMs: 2_000, expectedWordCount: 4 });
    expect(result).toEqual({
      kind: "valid",
      wordCount: 4,
      startMs: 0,
      endMs: 2_000,
      spokenMs: 1_900,
    });
    expect(hasUsableTimings(timings)).toBe(true);
  });

  it("catches overlapping words", () => {
    const overlapping = [
      { wordIndex: 0, startMs: 0, endMs: 500 },
      { wordIndex: 1, startMs: 400, endMs: 900 },
    ];
    const result = validateTimings(overlapping);
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.problems.map((problem) => problem.code)).toContain("overlap");
  });

  it("catches non-monotonic word indices", () => {
    const scrambled = [
      { wordIndex: 3, startMs: 0, endMs: 400 },
      { wordIndex: 1, startMs: 400, endMs: 900 },
    ];
    const result = validateTimings(scrambled);
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.problems.map((problem) => problem.code)).toContain("non_monotonic_index");
  });

  it("catches time running backwards", () => {
    const backwards = [
      { wordIndex: 0, startMs: 900, endMs: 1_200 },
      { wordIndex: 1, startMs: 100, endMs: 300 },
    ];
    const result = validateTimings(backwards);
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.problems.map((problem) => problem.code)).toContain("non_monotonic_time");
  });

  it("catches a word that ends before it starts", () => {
    const result = validateTimings([{ wordIndex: 0, startMs: 500, endMs: 500 }]);
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.problems.map((problem) => problem.code)).toContain("non_positive_duration");
  });

  it("catches timings that run past the clip", () => {
    const result = validateTimings(timings, { ayahDurationMs: 1_800 });
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.problems.map((problem) => problem.code)).toContain("exceeds_duration");
  });

  it("catches a word-count mismatch against the content package", () => {
    const result = validateTimings(timings, { expectedWordCount: 5 });
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.problems.map((problem) => problem.code)).toContain("word_count_mismatch");
  });

  it("catches non-finite times", () => {
    const result = validateTimings([{ wordIndex: 0, startMs: 0, endMs: Number.POSITIVE_INFINITY }]);
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.problems.map((problem) => problem.code)).toContain("non_finite");
  });
});

describe("activeWordAt", () => {
  it("is inclusive at the start of a word and exclusive at its end", () => {
    expect(activeWordAt(timings, 400)).toMatchObject({ kind: "active", wordIndex: 1 });
    expect(activeWordAt(timings, 399)).toMatchObject({ kind: "active", wordIndex: 0 });
    expect(activeWordAt(timings, 900)).toMatchObject({
      kind: "silence",
      beforeWordIndex: 1,
      afterWordIndex: 2,
    });
  });

  it("reports silence before the first word", () => {
    const early: readonly WordTiming[] = [{ wordIndex: 0, startMs: 250, endMs: 500 }];
    expect(activeWordAt(early, 100)).toEqual({
      kind: "silence",
      beforeWordIndex: null,
      afterWordIndex: 0,
    });
  });

  it("reports silence after the last word", () => {
    expect(activeWordAt(timings, 5_000)).toEqual({
      kind: "silence",
      beforeWordIndex: 3,
      afterWordIndex: null,
    });
  });

  it("agrees with a linear scan at every position, including the gaps", () => {
    const linear = (positionMs: number): number | null => {
      for (const timing of timings) {
        if (positionMs >= timing.startMs && positionMs < timing.endMs) return timing.wordIndex;
      }
      return null;
    };
    for (let positionMs = -100; positionMs <= 2_200; positionMs += 7) {
      expect(activeWordIndexAt(timings, positionMs)).toBe(linear(positionMs));
    }
  });

  it("finds the right word by binary search over a long clip", () => {
    const long: WordTiming[] = Array.from({ length: 2_000 }, (_unused, index) => ({
      wordIndex: index,
      startMs: index * 500,
      endMs: index * 500 + 400,
    }));
    const rand = mulberry32(99);
    for (let i = 0; i < 500; i += 1) {
      const positionMs = Math.floor(rand() * 1_000_000);
      const expected = long.findIndex(
        (timing) => positionMs >= timing.startMs && positionMs < timing.endMs,
      );
      expect(activeWordIndexAt(long, positionMs)).toBe(expected === -1 ? null : expected);
    }
  });

  it("keeps the search index one behind the first word that starts later", () => {
    expect(searchTimingIndex(timings, -1)).toBe(-1);
    expect(searchTimingIndex(timings, 0)).toBe(0);
    expect(searchTimingIndex(timings, 950)).toBe(1);
    expect(searchTimingIndex(timings, 10_000)).toBe(3);
  });

  it("names the next boundary so a caller can sleep until it", () => {
    expect(nextBoundaryMs(timings, 100)).toBe(400);
    expect(nextBoundaryMs(timings, 950)).toBe(1_000);
    expect(nextBoundaryMs(timings, 5_000)).toBeNull();
  });
});
