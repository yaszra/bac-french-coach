import { describe, expect, it } from "vitest";

import { emptyState } from "./fsrs";
import {
  DEFAULT_SCAFFOLD_CONFIG,
  SCAFFOLD_LEVELS,
  scaffoldLevel,
  scaffoldRank,
  scaffoldStrength,
} from "./scaffold";
import { mulberry32 } from "./simulate";
import { addDays } from "./time";
import type { MemoryState } from "./types";

const NOW = new Date("2026-06-01T09:00:00.000Z");

function state(overrides: Partial<MemoryState> = {}): MemoryState {
  return {
    ...emptyState("b:2:255", "ayah_body"),
    stability: 10,
    reps: 3,
    confidence: 0.6,
    lastReviewAt: NOW,
    lastRetrievalType: "review_blank",
    ...overrides,
  };
}

describe("scaffoldRank", () => {
  it("orders the levels from most support to none", () => {
    expect(SCAFFOLD_LEVELS.map(scaffoldRank)).toEqual([0, 1, 2, 3]);
  });
});

describe("scaffoldLevel", () => {
  it("shows the full text when nothing has been recorded", () => {
    const fresh = emptyState("b:2:255", "ayah_body");
    expect(scaffoldStrength(fresh, NOW)).toBe(0);
    expect(scaffoldLevel(fresh, NOW)).toBe("full_text");
  });

  it("fades to blank for a strong, well-evidenced unit", () => {
    expect(scaffoldLevel(state({ stability: 200, confidence: 1 }), NOW)).toBe("blank");
  });

  it("holds the full text for a weak, thinly-evidenced unit", () => {
    const weak = state({ stability: 1, confidence: 0.2, lastReviewAt: addDays(NOW, -10) });
    expect(scaffoldLevel(weak, NOW)).toBe("full_text");
  });

  it("passes through the intermediate levels as strength grows", () => {
    // Judged at each unit's own due date, so retrievability is equal (0.90) and only
    // stability separates them.
    const levels = [1, 8, 30, 400].map((stability) =>
      scaffoldLevel(state({ stability, confidence: 1 }), addDays(NOW, stability)),
    );
    expect(new Set(levels).size).toBeGreaterThan(2);
    expect(levels[0]).toBe("first_letters");
    expect(levels[levels.length - 1]).toBe("blank");
  });

  it("is monotone in stability (property)", () => {
    const rand = mulberry32(808);
    for (let trial = 0; trial < 200; trial += 1) {
      const lower = 0.05 + rand() * 100;
      const higher = lower + rand() * 200 + 0.01;
      const elapsed = rand() * 50;
      const at = addDays(NOW, elapsed);
      const weaker = scaffoldLevel(state({ stability: lower }), at);
      const stronger = scaffoldLevel(state({ stability: higher }), at);
      expect(scaffoldRank(stronger)).toBeGreaterThanOrEqual(scaffoldRank(weaker));
    }
  });

  it("is monotone in retrievability: support returns as the memory decays (property)", () => {
    const rand = mulberry32(909);
    for (let trial = 0; trial < 200; trial += 1) {
      const unit = state({ stability: 1 + rand() * 100, confidence: rand() });
      const soon = addDays(NOW, rand() * 20);
      const later = addDays(soon, 0.01 + rand() * 200);
      expect(scaffoldRank(scaffoldLevel(unit, later))).toBeLessThanOrEqual(
        scaffoldRank(scaffoldLevel(unit, soon)),
      );
    }
  });

  it("is monotone in confidence: weak evidence keeps the scaffold up (property)", () => {
    const rand = mulberry32(1010);
    for (let trial = 0; trial < 200; trial += 1) {
      const stability = 1 + rand() * 200;
      const lower = rand() * 0.5;
      const higher = lower + 0.01 + rand() * 0.4;
      const at = addDays(NOW, rand() * 30);
      expect(
        scaffoldRank(scaffoldLevel(state({ stability, confidence: higher }), at)),
      ).toBeGreaterThanOrEqual(
        scaffoldRank(scaffoldLevel(state({ stability, confidence: lower }), at)),
      );
    }
  });

  it("keeps strength inside [0,1] for any state (property)", () => {
    const rand = mulberry32(1111);
    for (let trial = 0; trial < 200; trial += 1) {
      const strength = scaffoldStrength(
        state({ stability: rand() * 36_500, confidence: rand() }),
        addDays(NOW, rand() * 1000),
      );
      expect(strength).toBeGreaterThanOrEqual(0);
      expect(strength).toBeLessThanOrEqual(1);
    }
  });

  it("honours custom thresholds", () => {
    const eager = { ...DEFAULT_SCAFFOLD_CONFIG, thresholds: [0.01, 0.02, 0.03] as const };
    expect(scaffoldLevel(state({ stability: 1, confidence: 0.1 }), NOW, undefined, eager)).toBe(
      "blank",
    );
  });
});
