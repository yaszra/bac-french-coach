import { describe, expect, it } from "vitest";

import { DEFAULT_SCHEDULING_POLICY } from "./fsrs";
import { meetsUnlockBar } from "./graph";
import {
  ARCHETYPES,
  ARCHETYPE_SPECS,
  archetypeModel,
  mulberry32,
  simulate,
  syntheticCurriculum,
  type ArchetypeContext,
  type Exercise,
  type SimulationOptions,
} from "./simulate";
import { isUnitId, unitKindOf, type Grade, type MemoryState } from "./types";

const START = new Date("2026-01-01T08:00:00.000Z");

const MODEL_STATE: MemoryState = {
  unitId: "b:2:1",
  kind: "ayah_body",
  stability: 12,
  difficulty: 5,
  reps: 3,
  lapses: 0,
  lastReviewAt: START,
  lastRetrievalType: "recall_first",
  confidence: 0.7,
};

const MODEL_EXERCISE: Exercise = {
  unitId: "b:2:1",
  action: "review",
  retrievalType: "recall_first",
};

const MODEL_CONTEXT: ArchetypeContext = {
  now: new Date("2026-01-13T08:00:00.000Z"),
  scheduling: DEFAULT_SCHEDULING_POLICY,
  dayIndex: 12,
};

function run(overrides: Partial<SimulationOptions> = {}) {
  const options: SimulationOptions = {
    archetype: "steady",
    days: 180,
    seed: 42,
    startAt: START,
    unitCount: 24,
    ...overrides,
  };
  return simulate(options);
}

describe("mulberry32", () => {
  it("produces values in [0,1) deterministically for a seed", () => {
    const first = mulberry32(7);
    const second = mulberry32(7);
    for (let draw = 0; draw < 500; draw += 1) {
      const value = first();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(second()).toBe(value);
    }
  });

  it("diverges for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const drawsA = Array.from({ length: 20 }, () => a());
    const drawsB = Array.from({ length: 20 }, () => b());
    expect(drawsA).not.toEqual(drawsB);
  });
});

describe("syntheticCurriculum", () => {
  it("interleaves āyah bodies with the transitions that join them", () => {
    const curriculum = syntheticCurriculum(5);
    expect(curriculum).toHaveLength(5);
    expect(curriculum.map((candidate) => candidate.unitId)).toEqual([
      "b:2:1",
      "t:2:1>2:2",
      "b:2:2",
      "t:2:2>2:3",
      "b:2:3",
    ]);
    for (const candidate of curriculum) {
      expect(isUnitId(candidate.unitId)).toBe(true);
      expect(unitKindOf(candidate.unitId)).toBe(candidate.kind);
    }
  });
});

describe("determinism", () => {
  it("replays exactly for the same seed", () => {
    expect(run({ days: 60 })).toEqual(run({ days: 60 }));
  });

  it("takes a different path for a different seed", () => {
    const first = run({ days: 60, seed: 1 });
    const second = run({ days: 60, seed: 2 });
    expect(second.events).not.toEqual(first.events);
  });

  it("keeps the archetype model pure given the same draws", () => {
    const model = archetypeModel(ARCHETYPE_SPECS.steady);
    const grade = (seed: number): readonly Grade[] => {
      const rand = mulberry32(seed);
      return Array.from({ length: 50 }, () => model(MODEL_STATE, MODEL_EXERCISE, rand, MODEL_CONTEXT));
    };
    expect(grade(3)).toEqual(grade(3));
    expect(new Set(grade(3)).size).toBeGreaterThan(1);
  });

  it("caps a guesser at 'hard': a lucky answer is never fluency", () => {
    const guesser = archetypeModel(ARCHETYPE_SPECS.guesser);
    const rand = mulberry32(9);
    const grades = Array.from({ length: 300 }, () =>
      guesser(MODEL_STATE, MODEL_EXERCISE, rand, MODEL_CONTEXT),
    );
    expect(new Set(grades)).toEqual(new Set<Grade>(["again", "hard"]));
  });
});

describe("archetypes", () => {
  it("gives a fast forgetter more lapses per 100 reviews than a steady learner", () => {
    const steady = run({ archetype: "steady" }).metrics;
    const forgetter = run({ archetype: "fast_forgetter" }).metrics;
    expect(forgetter.lapsesPer100Reviews ?? 0).toBeGreaterThan(steady.lapsesPer100Reviews ?? 0);
    expect(steady.lapses.denominator).toBeGreaterThan(0);
    expect(forgetter.lapses.denominator).toBeGreaterThan(0);
  });

  it("never lets a guesser reach mastery (evidence rule)", () => {
    const result = run({ archetype: "guesser" });
    expect(result.metrics.maxStability ?? 0).toBeLessThan(7);
    expect(result.metrics.lapsesPer100Reviews ?? 0).toBeGreaterThan(50);
    for (const state of result.finalStates) {
      expect(meetsUnlockBar(state)).toBe(false);
    }
  });

  it("holds a guesser back from new material instead of moving them on", () => {
    const guesser = run({ archetype: "guesser" });
    const steady = run({ archetype: "steady" });
    expect(guesser.metrics.unitsIntroduced).toBeLessThan(steady.metrics.unitsIntroduced);
    expect(steady.metrics.unitsIntroduced).toBe(24);
  });

  it("keeps a steady learner near the configured target retention", () => {
    const metrics = run({ archetype: "steady" }).metrics;
    expect(metrics.retentionAt7.denominator).toBeGreaterThan(20);
    expect(metrics.retentionAt7.rate ?? 0).toBeGreaterThan(0.8);
    expect(metrics.retentionAt7.rate ?? 0).toBeLessThanOrEqual(1);
    expect(metrics.lapsesPer100Reviews ?? 100).toBeLessThan(20);
  });

  it("lets a returning adult settle down over time", () => {
    const early = run({ archetype: "returning_adult", days: 30 }).metrics;
    const late = run({ archetype: "returning_adult", days: 180 }).metrics;
    expect(late.lapsesPer100Reviews ?? 0).toBeLessThan(early.lapsesPer100Reviews ?? 0);
  });
});

describe("schedule quality", () => {
  it("does not oscillate for a steady learner", () => {
    const metrics = run({ archetype: "steady" }).metrics;
    expect(metrics.scheduleStability.denominator).toBeGreaterThan(50);
    expect(metrics.scheduleStability.rate ?? 0).toBeGreaterThan(0.9);
  });

  it("keeps each day inside the tier's session budget", () => {
    const result = run({ archetype: "fast_forgetter", tier: "kids", days: 90 });
    // Kids: 10 minutes at 0.75 minutes per review is at most 14 items in a day.
    for (const count of result.metrics.reviewsPerDayByDay) {
      expect(count).toBeLessThanOrEqual(14);
    }
    expect(result.metrics.reviewsPerDayByDay).toHaveLength(90);
  });
});

describe("metrics honesty", () => {
  it("reports every rate with its denominator, and null when nothing was observed", () => {
    const metrics = run({ archetype: "guesser", days: 30 }).metrics;
    // A guesser never earns a 7-day interval, so there is nothing to measure.
    expect(metrics.retentionAt7.denominator).toBe(0);
    expect(metrics.retentionAt7.rate).toBeNull();
    expect(metrics.retentionAt30.rate).toBeNull();
    expect(metrics.lapses.denominator).toBe(metrics.totalReviews);
  });

  it("counts first exposures separately from reviews", () => {
    const result = run({ archetype: "steady", days: 60 });
    const introductions = result.events.filter((event) => event.action === "learn_new").length;
    expect(result.metrics.totalObservations).toBe(result.metrics.totalReviews + introductions);
    expect(introductions).toBe(result.metrics.unitsIntroduced);
  });

  it("returns an empty, honest result for a zero-day run", () => {
    const metrics = run({ days: 0 }).metrics;
    expect(metrics.totalObservations).toBe(0);
    expect(metrics.reviewsPerDay).toBeNull();
    expect(metrics.meanStability).toBeNull();
    expect(metrics.scheduleStability.rate).toBeNull();
  });

  it("exposes a model for every archetype", () => {
    expect(Object.keys(ARCHETYPES).sort()).toEqual(
      ["fast_forgetter", "guesser", "returning_adult", "steady"].sort(),
    );
  });
});
