import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHUNKING_CONFIG,
  chunkSizeStats,
  recommendChunkSize,
  type ChunkAttempt,
} from "./chunking";
import { addDays } from "./time";

const NOW = new Date("2026-06-01T09:00:00.000Z");

function attempts(
  chunkSize: number,
  results: readonly boolean[],
  secondsPerUnit = 30,
  startDaysAgo = 1,
): readonly ChunkAttempt[] {
  return results.map((success, index) => ({
    chunkSize,
    success,
    secondsToComplete: secondsPerUnit * chunkSize,
    at: addDays(NOW, -(startDaysAgo + index)),
  }));
}

describe("not enough evidence", () => {
  it("says so, with denominators, when there are barely any attempts", () => {
    const result = recommendChunkSize(attempts(3, [true, true]), NOW);
    expect(result.status).toBe("not_enough_evidence");
    if (result.status !== "not_enough_evidence") return;
    expect(result.observedAttempts).toBe(2);
    expect(result.requiredAttempts).toBe(DEFAULT_CHUNKING_CONFIG.minTotalAttempts);
    expect(result.fallbackChunkSize).toBe(DEFAULT_CHUNKING_CONFIG.minChunkSize);
    expect(result.reason.key).toBe("memory.chunk.reason.not_enough_evidence");
  });

  it("says so when many attempts are spread too thinly across sizes", () => {
    const spread: ChunkAttempt[] = [];
    for (let size = 1; size <= 10; size += 1) spread.push(...attempts(size, [true, true]));
    const result = recommendChunkSize(spread, NOW);
    expect(spread).toHaveLength(20);
    expect(result.status).toBe("not_enough_evidence");
  });

  it("says so for an empty history rather than guessing", () => {
    const result = recommendChunkSize([], NOW);
    expect(result.status).toBe("not_enough_evidence");
    if (result.status !== "not_enough_evidence") return;
    expect(result.observedAttempts).toBe(0);
    expect(result.basis).toEqual([]);
  });
});

describe("recommendation", () => {
  it("holds at the largest size the learner actually sustains", () => {
    const history = [
      ...attempts(3, [true, true, true, true, true]),
      ...attempts(5, [false, false, true, false]),
    ];
    const result = recommendChunkSize(history, NOW);
    expect(result.status).toBe("recommended");
    if (result.status !== "recommended") return;
    expect(result.chunkSize).toBe(3);
    expect(result.extrapolated).toBe(false);
    expect(result.reason.key).toBe("memory.chunk.reason.holding_at_measured_size");
    expect(result.reason.params.attempts).toBe(5);
    expect(result.reason.params.successes).toBe(5);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("proposes one step up — flagged as extrapolation — after a near-perfect run", () => {
    const result = recommendChunkSize(attempts(3, [true, true, true, true, true, true]), NOW);
    expect(result.status).toBe("recommended");
    if (result.status !== "recommended") return;
    expect(result.chunkSize).toBe(4);
    expect(result.extrapolated).toBe(true);
    expect(result.reason.key).toBe("memory.chunk.reason.stretch_after_high_success");
    expect(result.reason.params.measuredChunkSize).toBe(3);
  });

  it("steps down when no practised size holds the target rate", () => {
    const history = [
      ...attempts(3, [false, false, true, false]),
      ...attempts(5, [false, false, false, true]),
    ];
    const result = recommendChunkSize(history, NOW);
    expect(result.status).toBe("recommended");
    if (result.status !== "recommended") return;
    expect(result.chunkSize).toBe(2);
    expect(result.extrapolated).toBe(true);
    expect(result.reason.key).toBe("memory.chunk.reason.stepping_down_after_failures");
  });

  it("never recommends below the configured floor", () => {
    const result = recommendChunkSize(attempts(1, [false, false, false, false, true, false, false, false]), NOW);
    expect(result.status).toBe("recommended");
    if (result.status !== "recommended") return;
    expect(result.chunkSize).toBe(DEFAULT_CHUNKING_CONFIG.minChunkSize);
  });

  it("rejects a size the learner completes too slowly", () => {
    const history = [
      ...attempts(3, [true, true, true, true, true]),
      // Same success rate, but three times the seconds per unit.
      ...attempts(6, [true, true, true, true], 120),
    ];
    const result = recommendChunkSize(history, NOW);
    expect(result.status).toBe("recommended");
    if (result.status !== "recommended") return;
    expect(result.chunkSize).toBe(3);
  });

  it("weights recent evidence over old evidence", () => {
    const history = [
      ...attempts(6, [true, true, true, true, true, true], 30, 300),
      ...attempts(6, [false, false, false, false], 30, 1),
      ...attempts(2, [true, true, true, true], 30, 1),
    ];
    const result = recommendChunkSize(history, NOW);
    expect(result.status).toBe("recommended");
    if (result.status !== "recommended") return;
    expect(result.chunkSize).toBeLessThan(6);
  });

  it("caps the stretch at the configured maximum", () => {
    const result = recommendChunkSize(
      attempts(10, [true, true, true, true, true, true, true, true]),
      NOW,
    );
    expect(result.status).toBe("recommended");
    if (result.status !== "recommended") return;
    expect(result.chunkSize).toBe(10);
    expect(result.extrapolated).toBe(false);
  });
});

describe("chunkSizeStats", () => {
  it("reports every rate with its denominator", () => {
    const stats = chunkSizeStats([...attempts(3, [true, false, true])], NOW);
    const size3 = stats.find((stat) => stat.chunkSize === 3);
    expect(size3?.attempts).toBe(3);
    expect(size3?.successes).toBe(2);
    expect(size3?.successRate).toBeCloseTo(2 / 3, 10);
    expect(size3?.weightedSuccessRate).not.toBeNull();
    expect(size3?.medianSecondsPerUnit).toBeCloseTo(30, 6);
  });

  it("returns null rates — never zero — when a size has no successes to time", () => {
    const stats = chunkSizeStats([...attempts(4, [false, false])], NOW);
    const size4 = stats.find((stat) => stat.chunkSize === 4);
    expect(size4?.successRate).toBe(0);
    expect(size4?.medianSecondsPerUnit).toBeNull();
  });

  it("is sorted by chunk size and ignores malformed attempts", () => {
    const stats = chunkSizeStats(
      [
        ...attempts(5, [true]),
        ...attempts(2, [true]),
        { chunkSize: 0, success: true, secondsToComplete: 10, at: NOW },
      ],
      NOW,
    );
    expect(stats.map((stat) => stat.chunkSize)).toEqual([2, 5]);
  });
});
