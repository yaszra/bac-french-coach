import { describe, expect, it } from "vitest";
import { emptyState } from "@/modules/memory/domain/fsrs";
import type { MemoryState } from "@/modules/memory/domain/types";
import {
  DEFAULT_INK_DEPTH_CONFIG,
  READ_VIEW_DEPTH,
  inkDepthOf,
  inkStrength,
  isQuranView,
  passageInkDepth,
  wordDepthFor,
} from "./ink-depth";

const NOW = new Date("2026-08-23T09:00:00.000Z");

function state(partial: Partial<MemoryState> = {}): MemoryState {
  return {
    ...emptyState("b:78:1", "ayah_body"),
    stability: 10,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    lastReviewAt: new Date("2026-08-22T09:00:00.000Z"),
    lastRetrievalType: "rebuild",
    confidence: 0.8,
    ...partial,
  };
}

describe("ink depth", () => {
  it("is 0 when there is no row at all — not yet recorded, not zero progress", () => {
    expect(inkDepthOf(undefined, NOW)).toBe(0);
  });

  it("is 0 for a row with nothing recorded", () => {
    expect(inkDepthOf(emptyState("b:78:1", "ayah_body"), NOW)).toBe(0);
  });

  it("is 0 for a row with a review date but no reps", () => {
    expect(inkDepthOf(state({ reps: 0 }), NOW)).toBe(0);
  });

  it("is 0 for a row with reps but no review ever recorded", () => {
    expect(inkDepthOf(state({ lastReviewAt: null }), NOW)).toBe(0);
  });

  it("is never 0 once there is evidence, however weak", () => {
    const weak = state({
      stability: 0.01,
      confidence: 0.01,
      reps: 1,
      lastReviewAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    expect(inkDepthOf(weak, NOW)).toBe(1);
  });

  it("reaches the top of the ladder for a long-held, freshly reviewed unit", () => {
    const held = state({ stability: 400, confidence: 1, lastReviewAt: NOW });
    expect(inkDepthOf(held, NOW)).toBe(5);
  });

  it("never exceeds the ladder", () => {
    const absurd = state({ stability: 1e6, confidence: 1, lastReviewAt: NOW });
    expect(inkDepthOf(absurd, NOW)).toBeLessThanOrEqual(5);
  });

  it("is monotone in stability", () => {
    const depths = [1, 5, 20, 60, 200, 1000].map((stability) =>
      inkDepthOf(state({ stability, lastReviewAt: NOW }), NOW),
    );
    for (let i = 1; i < depths.length; i += 1) {
      expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1] as number);
    }
  });

  it("is monotone in confidence", () => {
    const depths = [0, 0.25, 0.5, 0.75, 1].map((confidence) =>
      inkDepthOf(state({ confidence, stability: 60, lastReviewAt: NOW }), NOW),
    );
    for (let i = 1; i < depths.length; i += 1) {
      expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1] as number);
    }
  });

  it("fades as time passes without review", () => {
    const fresh = inkDepthOf(state({ stability: 20, lastReviewAt: NOW }), NOW);
    const stale = inkDepthOf(
      state({ stability: 20, lastReviewAt: new Date("2026-01-01T00:00:00.000Z") }),
      NOW,
    );
    expect(stale).toBeLessThanOrEqual(fresh);
  });

  it("treats a negative stability as zero rather than throwing", () => {
    expect(inkDepthOf(state({ stability: -50 }), NOW)).toBeGreaterThanOrEqual(1);
  });

  it("keeps strength inside [0, 1]", () => {
    for (const stability of [0, 1, 100, 1e6]) {
      const value = inkStrength(state({ stability, lastReviewAt: NOW }), NOW);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("gives a state with no evidence a strength of exactly 0", () => {
    expect(inkStrength(emptyState("b:78:1", "ayah_body"), NOW)).toBe(0);
  });

  it("honours a custom threshold table", () => {
    const generous = { ...DEFAULT_INK_DEPTH_CONFIG, thresholds: [0, 0, 0, 0] as const };
    expect(inkDepthOf(state(), NOW, undefined, generous)).toBe(5);
  });

  it("takes a passage's depth from its weakest recorded unit", () => {
    const strong = state({ stability: 400, confidence: 1, lastReviewAt: NOW });
    const weak = state({ stability: 0.5, confidence: 0.1, reps: 1 });
    expect(passageInkDepth([strong, weak], NOW)).toBe(inkDepthOf(weak, NOW));
  });

  it("gives an entirely unrecorded passage depth 0", () => {
    expect(passageInkDepth([undefined, undefined], NOW)).toBe(0);
  });

  it("gives an empty passage depth 0 rather than throwing", () => {
    expect(passageInkDepth([], NOW)).toBe(0);
  });

  it("drops a passage to 0 when any single unit is unrecorded", () => {
    const strong = state({ stability: 400, confidence: 1, lastReviewAt: NOW });
    expect(passageInkDepth([strong, undefined], NOW)).toBe(0);
  });
});

describe("the read view", () => {
  it("is always full ink, whatever the memory says", () => {
    expect(wordDepthFor("read", 0)).toBe(READ_VIEW_DEPTH);
    expect(wordDepthFor("read", 3)).toBe(READ_VIEW_DEPTH);
  });

  it("leaves the memory view alone", () => {
    expect(wordDepthFor("memory", 0)).toBe(0);
    expect(wordDepthFor("memory", 4)).toBe(4);
  });

  it("recognises only the two views it has", () => {
    expect(isQuranView("read")).toBe(true);
    expect(isQuranView("memory")).toBe(true);
    expect(isQuranView("khatma")).toBe(false);
    expect(isQuranView(undefined)).toBe(false);
  });
});
