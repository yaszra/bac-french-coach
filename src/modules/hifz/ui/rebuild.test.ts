import { describe, expect, it } from "vitest";
import {
  chooseGaps,
  isComplete,
  mulberry32,
  place,
  rebuildEvidence,
  scramble,
  shuffle,
  startRebuild,
} from "./rebuild";

describe("the seeded shuffle", () => {
  it("is deterministic for a seed", () => {
    const a = shuffle([1, 2, 3, 4, 5, 6], mulberry32(7));
    const b = shuffle([1, 2, 3, 4, 5, 6], mulberry32(7));
    expect(a).toEqual(b);
  });

  it("differs between seeds", () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(1));
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it("keeps every tile", () => {
    const out = shuffle([1, 2, 3, 4, 5], mulberry32(9));
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("leaves the input untouched", () => {
    const input = [1, 2, 3];
    shuffle(input, mulberry32(3));
    expect(input).toEqual([1, 2, 3]);
  });

  it("stays inside [0, 1)", () => {
    const random = mulberry32(42);
    for (let i = 0; i < 200; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("the re-scramble", () => {
  it("never hands back the original order", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const items = [0, 1, 2, 3];
      expect(scramble(items, mulberry32(seed))).not.toEqual(items);
    }
  });

  it("returns a single tile unchanged rather than pretending to scramble it", () => {
    expect(scramble([4], mulberry32(1))).toEqual([4]);
  });

  it("returns an empty tray unchanged", () => {
    expect(scramble([], mulberry32(1))).toEqual([]);
  });

  it("swaps a two-tile tray", () => {
    expect(scramble([0, 1], mulberry32(5))).toEqual([1, 0]);
  });
});

describe("rebuilding a line", () => {
  it("starts with everything in the tray and nothing placed", () => {
    const state = startRebuild(5, 1);
    expect(state.placed).toEqual([]);
    expect([...state.tray].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(state.placements).toEqual([]);
  });

  it("does not present the tray in the answer's order", () => {
    expect(startRebuild(6, 3).tray).not.toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("accepts the right tile and takes it out of the tray", () => {
    const next = place(startRebuild(4, 1), 0);
    expect(next.placed).toEqual([0]);
    expect(next.tray).not.toContain(0);
  });

  it("records a wrong tile without hiding it, and keeps it in the tray", () => {
    const next = place(startRebuild(4, 1), 2);
    expect(next.placed).toEqual([]);
    expect(next.tray).toContain(2);
    expect(next.placements).toEqual([{ index: 0, correct: false }]);
  });

  it("re-scrambles after every placement, right or wrong", () => {
    const start = startRebuild(6, 11);
    const afterRight = place(start, 0);
    expect(afterRight.rescrambles).toBe(1);
    const afterWrong = place(start, 3);
    expect(afterWrong.rescrambles).toBe(1);
    expect(afterWrong.tray).not.toEqual(start.tray);
  });

  it("ignores a tile that is not in the tray", () => {
    const start = startRebuild(3, 1);
    const once = place(start, 0);
    expect(place(once, 0)).toBe(once);
  });

  it("completes when every word is placed in order", () => {
    let state = startRebuild(4, 1);
    for (const word of [0, 1, 2, 3]) state = place(state, word);
    expect(isComplete(state)).toBe(true);
    expect(state.placed).toEqual([0, 1, 2, 3]);
  });

  it("is not complete before the last word", () => {
    let state = startRebuild(3, 1);
    state = place(state, 0);
    expect(isComplete(state)).toBe(false);
  });

  it("is not complete for an empty passage", () => {
    expect(isComplete(startRebuild(0, 1))).toBe(false);
  });

  it("produces evidence that carries observations and no grade", () => {
    let state = startRebuild(3, 1);
    state = place(state, 1);
    state = place(state, 0);
    const evidence = rebuildEvidence(state, 4200.7);
    expect(evidence).toEqual({
      exercise: "rebuild",
      placements: [
        { index: 0, correct: false },
        { index: 0, correct: true },
      ],
      rescrambles: 2,
      elapsedMs: 4201,
    });
    expect(Object.keys(evidence)).not.toContain("grade");
    expect(Object.keys(evidence)).not.toContain("score");
  });

  it("refuses a negative elapsed time", () => {
    const evidence = rebuildEvidence(startRebuild(2, 1), -10);
    expect(evidence.elapsedMs).toBe(0);
  });
});

describe("choosing gaps", () => {
  it("never blanks the first word — there is nothing to retrieve from", () => {
    expect(chooseGaps(6, 5, 1)).not.toContain(0);
  });

  it("returns nothing for a passage too short to have a gap", () => {
    expect(chooseGaps(1, 2, 1)).toEqual([]);
    expect(chooseGaps(0, 2, 1)).toEqual([]);
  });

  it("prefers the seams the learner is weak at", () => {
    expect(chooseGaps(10, 2, 1, [7, 8])).toEqual([7, 8]);
  });

  it("ignores an out-of-range preference rather than trusting it", () => {
    expect(chooseGaps(5, 1, 1, [99])).not.toContain(99);
  });

  it("never asks for more gaps than the passage can hold", () => {
    expect(chooseGaps(4, 99, 1)).toHaveLength(3);
  });

  it("is deterministic for a seed", () => {
    expect(chooseGaps(12, 4, 5)).toEqual(chooseGaps(12, 4, 5));
  });

  it("returns the gaps in reading order", () => {
    const gaps = chooseGaps(20, 6, 3);
    expect([...gaps].sort((a, b) => a - b)).toEqual(gaps);
  });
});
