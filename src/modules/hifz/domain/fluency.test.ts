import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLUENCY_CONFIG,
  detectHesitations,
  hesitationSignals,
  measureFluency,
  observationsFromLatencies,
} from "./fluency";

const even = observationsFromLatencies([600, 620, 590, 610, 600, 605, 595, 615]);

describe("measureFluency — honesty about samples", () => {
  it("refuses to produce a number from too few samples", () => {
    const result = measureFluency({
      observations: observationsFromLatencies([600, 610, 590]),
      expectedMsPerWord: 600,
    });
    expect(result.kind).toBe("not_enough_samples");
    if (result.kind !== "not_enough_samples") return;
    expect(result).toMatchObject({ samples: 3, required: DEFAULT_FLUENCY_CONFIG.minSamples });
  });

  it("measures pace but invents no fluency score without a reference pace", () => {
    const result = measureFluency({ observations: even, expectedMsPerWord: null });
    expect(result.kind).toBe("no_expected_pace");
    if (result.kind !== "no_expected_pace") return;
    expect(result.medianLatencyMs).toBeGreaterThan(0);
    expect(result.hesitations).toEqual([]);
  });

  it("reports discarded samples rather than dropping them silently", () => {
    const result = measureFluency({
      observations: [
        ...even,
        { wordIndex: 99, latencyMs: 120_000 },
        { wordIndex: 100, latencyMs: Number.NaN },
      ],
      expectedMsPerWord: 600,
    });
    expect(result.kind).toBe("measured");
    if (result.kind !== "measured") return;
    expect(result.discarded).toBe(2);
    expect(result.samples).toBe(even.length);
  });
});

describe("measureFluency — the measure itself", () => {
  it("reads a learner at the reference pace as fluent and confident", () => {
    const result = measureFluency({ observations: even, expectedMsPerWord: 600 });
    expect(result.kind).toBe("measured");
    if (result.kind !== "measured") return;
    expect(result.paceRatio).toBeGreaterThan(0.95);
    expect(result.paceRatio).toBeLessThan(1.05);
    expect(result.fluency).toBeGreaterThan(0.9);
    expect(result.confidence).toBeGreaterThan(0.3);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.wordsPerMinute).toBeGreaterThan(90);
  });

  it("marks a slow reciter down without calling them wrong", () => {
    const slow = observationsFromLatencies([1_800, 1_750, 1_820, 1_790, 1_810, 1_770]);
    const result = measureFluency({ observations: slow, expectedMsPerWord: 600 });
    if (result.kind !== "measured") throw new Error("expected a measurement");
    expect(result.paceRatio).toBeLessThan(0.5);
    expect(result.fluency).toBeLessThan(0.5);
    expect(result.hesitations).toEqual([]);
  });

  it("grows more confident with more samples", () => {
    const few = measureFluency({
      observations: observationsFromLatencies([600, 610, 590, 605, 600]),
      expectedMsPerWord: 600,
    });
    const many = measureFluency({
      observations: observationsFromLatencies(Array.from({ length: 40 }, () => 600)),
      expectedMsPerWord: 600,
    });
    if (few.kind !== "measured" || many.kind !== "measured") throw new Error("expected measurements");
    expect(many.confidence).toBeGreaterThan(few.confidence);
  });
});

describe("detectHesitations", () => {
  it("finds the word the learner stalled on", () => {
    const observations = observationsFromLatencies([600, 620, 590, 4_200, 610, 600, 605]);
    const hesitations = detectHesitations(observations);
    expect(hesitations).toHaveLength(1);
    expect(hesitations[0]?.wordIndex).toBe(3);
    expect(hesitations[0]?.ratioToMedian).toBeGreaterThan(3);
    expect(hesitations[0]?.severity).toBeGreaterThan(0);
  });

  it("finds nothing in an evenly paced recitation", () => {
    expect(detectHesitations(even)).toEqual([]);
  });

  it("does not mark a uniformly slow learner as hesitant", () => {
    const slow = observationsFromLatencies([2_000, 2_050, 1_980, 2_010, 2_030, 1_990]);
    expect(detectHesitations(slow)).toEqual([]);
  });

  it("ranks the worst stall first", () => {
    const observations = observationsFromLatencies([600, 3_000, 600, 9_000, 600, 620, 610]);
    const hesitations = detectHesitations(observations);
    expect(hesitations.map((hesitation) => hesitation.wordIndex)).toEqual([3, 1]);
  });
});

describe("hesitationSignals", () => {
  it("resolves stalls onto units and keeps the worst per unit", () => {
    const hesitations = detectHesitations(
      observationsFromLatencies([600, 5_000, 600, 8_000, 600, 610, 620]),
    );
    const signals = hesitationSignals(hesitations, (wordIndex) =>
      wordIndex === 1 || wordIndex === 3 ? "t:2:255>2:256" : null,
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]?.unitId).toBe("t:2:255>2:256");
    expect(signals[0]?.wordIndex).toBe(3);
  });

  it("drops stalls the caller cannot place", () => {
    const hesitations = detectHesitations(observationsFromLatencies([600, 5_000, 600, 610, 620, 615]));
    expect(hesitationSignals(hesitations, () => null)).toEqual([]);
  });
});
