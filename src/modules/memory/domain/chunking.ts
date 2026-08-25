/**
 * Chunk sizing from measured capacity.
 *
 * How many āyāt (or lines) should this learner take on in one go? The engine does
 * not guess: it measures. Attempts are weighted by recency, every rate carries its
 * denominator, and when the evidence is thin the answer is the honest
 * `"not_enough_evidence"` — never a confident number pulled from nothing.
 *
 * Pure: `now` comes from the caller, and the attempt history is projected from the
 * append-only event log by the repo layer.
 */

import { clamp01, median } from "./numeric";
import { daysBetween } from "./time";
import { reason, type Reason } from "./types";

export interface ChunkAttempt {
  /** How many units the learner took on in one go. */
  readonly chunkSize: number;
  /** Server-validated: did the learner complete the chunk to standard? */
  readonly success: boolean;
  readonly secondsToComplete: number;
  readonly at: Date;
}

export interface ChunkingConfig {
  /** Attempts at one size before that size can be recommended. */
  readonly minAttemptsPerSize: number;
  /** Attempts across all sizes before any recommendation is made. */
  readonly minTotalAttempts: number;
  /** Weighted success rate a size must hold to be recommended. */
  readonly targetSuccessRate: number;
  /** Weighted success rate above which we propose one step up. */
  readonly stretchSuccessRate: number;
  /** Half-life for recency weighting of older attempts. */
  readonly recencyHalfLifeDays: number;
  readonly minChunkSize: number;
  readonly maxChunkSize: number;
  /** A size is rejected when it takes longer than this per unit. */
  readonly maxSecondsPerUnit: number;
  /** Weighted attempts that buy ~63% confidence. */
  readonly confidenceScale: number;
  /** Confidence multiplier applied when the recommendation steps outside the data. */
  readonly extrapolationPenalty: number;
}

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  minAttemptsPerSize: 3,
  minTotalAttempts: 8,
  targetSuccessRate: 0.8,
  stretchSuccessRate: 0.95,
  recencyHalfLifeDays: 14,
  minChunkSize: 1,
  maxChunkSize: 10,
  maxSecondsPerUnit: 90,
  confidenceScale: 6,
  extrapolationPenalty: 0.7,
};

export interface ChunkSizeStat {
  readonly chunkSize: number;
  /** Raw denominator — always reported, even when the rate is null. */
  readonly attempts: number;
  readonly successes: number;
  readonly successRate: number | null;
  readonly weightedAttempts: number;
  readonly weightedSuccessRate: number | null;
  readonly medianSecondsPerUnit: number | null;
}

export type ChunkRecommendation =
  | {
      readonly status: "not_enough_evidence";
      readonly reason: Reason;
      readonly observedAttempts: number;
      readonly requiredAttempts: number;
      /** What to run meanwhile: the smallest safe chunk, stated as a fallback. */
      readonly fallbackChunkSize: number;
      readonly basis: readonly ChunkSizeStat[];
    }
  | {
      readonly status: "recommended";
      readonly chunkSize: number;
      /** 0..1 — evidential confidence, not a success prediction. */
      readonly confidence: number;
      /** True when the size recommended was never actually attempted. */
      readonly extrapolated: boolean;
      readonly reason: Reason;
      readonly basis: readonly ChunkSizeStat[];
    };

/** Per-size statistics, sorted by chunk size. Recency-weighted, denominators intact. */
export function chunkSizeStats(
  attempts: readonly ChunkAttempt[],
  now: Date,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
): readonly ChunkSizeStat[] {
  const bySize = new Map<number, ChunkAttempt[]>();
  for (const attempt of attempts) {
    if (!Number.isFinite(attempt.chunkSize) || attempt.chunkSize < 1) continue;
    const size = Math.round(attempt.chunkSize);
    const list = bySize.get(size);
    if (list === undefined) bySize.set(size, [attempt]);
    else list.push(attempt);
  }

  const stats: ChunkSizeStat[] = [];
  for (const [chunkSize, list] of bySize) {
    let successes = 0;
    let weighted = 0;
    let weightedSuccesses = 0;
    const secondsPerUnit: number[] = [];
    for (const attempt of list) {
      // Recency weight: 0.5 ^ (age / half-life). Old capacity is weak evidence.
      const ageDays = Math.max(0, daysBetween(attempt.at, now));
      const weight = Math.pow(0.5, ageDays / Math.max(config.recencyHalfLifeDays, 0.5));
      weighted += weight;
      if (attempt.success) {
        successes += 1;
        weightedSuccesses += weight;
        secondsPerUnit.push(attempt.secondsToComplete / chunkSize);
      }
    }
    stats.push({
      chunkSize,
      attempts: list.length,
      successes,
      successRate: list.length === 0 ? null : successes / list.length,
      weightedAttempts: weighted,
      weightedSuccessRate: weighted <= 0 ? null : weightedSuccesses / weighted,
      medianSecondsPerUnit: median(secondsPerUnit),
    });
  }
  return stats.sort((left, right) => left.chunkSize - right.chunkSize);
}

/**
 * Recommend a chunk size, or say honestly that there is not enough evidence.
 *
 * The rule, in order:
 *   1. too few attempts overall, or no single size practised enough → not enough evidence;
 *   2. the largest well-practised size that holds the target success rate *and* is not
 *      taking too long per unit → recommend it;
 *   3. that size also clearing the stretch rate at the top of the observed range →
 *      propose one step up, flagged `extrapolated`, at reduced confidence;
 *   4. nothing holding the target rate → step one below the smallest practised size,
 *      never below `minChunkSize`.
 */
export function recommendChunkSize(
  attempts: readonly ChunkAttempt[],
  now: Date,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
): ChunkRecommendation {
  const basis = chunkSizeStats(attempts, now, config);
  const observedAttempts = basis.reduce((total, stat) => total + stat.attempts, 0);
  const practised = basis.filter((stat) => stat.attempts >= config.minAttemptsPerSize);

  if (observedAttempts < config.minTotalAttempts || practised.length === 0) {
    return {
      status: "not_enough_evidence",
      reason: reason("memory.chunk.reason.not_enough_evidence", {
        observedAttempts,
        requiredAttempts: config.minTotalAttempts,
        minAttemptsPerSize: config.minAttemptsPerSize,
        practisedSizes: practised.length,
      }),
      observedAttempts,
      requiredAttempts: config.minTotalAttempts,
      fallbackChunkSize: config.minChunkSize,
      basis,
    };
  }

  const holdsTarget = (stat: ChunkSizeStat): boolean => {
    const rate = stat.weightedSuccessRate;
    if (rate === null || rate < config.targetSuccessRate) return false;
    const seconds = stat.medianSecondsPerUnit;
    return seconds === null || seconds <= config.maxSecondsPerUnit;
  };

  const passing = practised.filter(holdsTarget);
  const largestPractised = practised[practised.length - 1];

  if (passing.length === 0) {
    const smallestPractised = practised[0];
    const floorSize = smallestPractised === undefined ? config.minChunkSize : smallestPractised.chunkSize - 1;
    const chunkSize = Math.max(config.minChunkSize, Math.min(floorSize, config.maxChunkSize));
    const evidence = practised.reduce((total, stat) => total + stat.weightedAttempts, 0);
    return {
      status: "recommended",
      chunkSize,
      confidence: clamp01(
        (1 - Math.exp(-evidence / Math.max(config.confidenceScale, 0.5))) *
          config.extrapolationPenalty,
      ),
      extrapolated: true,
      reason: reason("memory.chunk.reason.stepping_down_after_failures", {
        chunkSize,
        smallestPractisedSize: smallestPractised?.chunkSize ?? config.minChunkSize,
        successes: smallestPractised?.successes ?? 0,
        attempts: smallestPractised?.attempts ?? 0,
        targetSuccessRate: config.targetSuccessRate,
      }),
      basis,
    };
  }

  const best = passing[passing.length - 1];
  if (best === undefined || largestPractised === undefined) {
    return {
      status: "not_enough_evidence",
      reason: reason("memory.chunk.reason.not_enough_evidence", {
        observedAttempts,
        requiredAttempts: config.minTotalAttempts,
        minAttemptsPerSize: config.minAttemptsPerSize,
        practisedSizes: practised.length,
      }),
      observedAttempts,
      requiredAttempts: config.minTotalAttempts,
      fallbackChunkSize: config.minChunkSize,
      basis,
    };
  }

  const baseConfidence = clamp01(
    1 - Math.exp(-best.weightedAttempts / Math.max(config.confidenceScale, 0.5)),
  );
  const rate = best.weightedSuccessRate ?? 0;
  const atCeilingOfEvidence = best.chunkSize === largestPractised.chunkSize;

  if (atCeilingOfEvidence && rate >= config.stretchSuccessRate && best.chunkSize < config.maxChunkSize) {
    return {
      status: "recommended",
      chunkSize: best.chunkSize + 1,
      confidence: clamp01(baseConfidence * config.extrapolationPenalty),
      extrapolated: true,
      reason: reason("memory.chunk.reason.stretch_after_high_success", {
        chunkSize: best.chunkSize + 1,
        measuredChunkSize: best.chunkSize,
        successes: best.successes,
        attempts: best.attempts,
        weightedSuccessRate: Math.round(rate * 100) / 100,
      }),
      basis,
    };
  }

  return {
    status: "recommended",
    chunkSize: best.chunkSize,
    confidence: baseConfidence,
    extrapolated: false,
    reason: reason("memory.chunk.reason.holding_at_measured_size", {
      chunkSize: best.chunkSize,
      successes: best.successes,
      attempts: best.attempts,
      weightedSuccessRate: Math.round(rate * 100) / 100,
      medianSecondsPerUnit:
        best.medianSecondsPerUnit === null ? 0 : Math.round(best.medianSecondsPerUnit),
    }),
    basis,
  };
}
