/**
 * Fluency from timing observations.
 *
 * Fluency is measured, never asserted: the input is per-word latency (milliseconds
 * from the previous word to this one, as measured on the client's clock) plus the
 * expected pace for the passage. The output always carries how many samples it rests
 * on and how confident that makes it, and there is an explicit
 * `not_enough_samples` state — a two-word sample produces no number at all.
 *
 * Hesitation points are found relative to the learner's *own* median, with a robust
 * (median + MAD) threshold, so a naturally slow reciter is not marked as hesitant
 * everywhere. Those word indices are the raw material for weak joins: the place a
 * learner stalls is where the memory actually breaks (see `weakJoins.ts`).
 *
 * Pure: no clock, no I/O. Nothing here writes memory state or grades anything.
 */

import { clamp01, median, roundTo } from "@/modules/memory/domain/numeric";
import type { UnitId } from "@/modules/memory/domain/types";

/** One measured word-to-word latency. */
export interface FluencyObservation {
  readonly wordIndex: number;
  readonly latencyMs: number;
}

export interface Hesitation {
  readonly wordIndex: number;
  readonly latencyMs: number;
  /** How many times the learner's own median this latency is. */
  readonly ratioToMedian: number;
  /** 0..1 — how far past the spike threshold it sits. */
  readonly severity: number;
}

export interface FluencyConfig {
  /** Below this many usable samples, no fluency number is produced. */
  readonly minSamples: number;
  /** A latency this many times the median is a spike even when spread is zero. */
  readonly spikeMedianMultiple: number;
  /** A latency this many MADs above the median is a spike. */
  readonly spikeMadMultiple: number;
  /** Above this, the observation is a paused session, not a hesitation. */
  readonly maxPlausibleLatencyMs: number;
}

/**
 * Defaults, and why:
 * - `minSamples` 5: fewer than five words says nothing about pace.
 * - `spikeMedianMultiple` 2 with `spikeMadMultiple` 3: the classic robust outlier
 *   bar, plus a floor so an unnaturally even reciter still shows real stalls.
 * - `maxPlausibleLatencyMs` 30 s: past half a minute the learner was interrupted;
 *   that sample is discarded and *reported as discarded*, never silently dropped.
 */
export const DEFAULT_FLUENCY_CONFIG: FluencyConfig = {
  minSamples: 5,
  spikeMedianMultiple: 2,
  spikeMadMultiple: 3,
  maxPlausibleLatencyMs: 30_000,
};

export interface FluencyInput {
  readonly observations: readonly FluencyObservation[];
  /** Reference pace for this passage, in milliseconds per word. */
  readonly expectedMsPerWord: number | null;
  readonly config?: FluencyConfig;
}

export type FluencyResult =
  | {
      readonly kind: "not_enough_samples";
      readonly samples: number;
      readonly required: number;
      readonly discarded: number;
    }
  | {
      /** Measured, but with no reference pace no fluency number is invented. */
      readonly kind: "no_expected_pace";
      readonly samples: number;
      readonly discarded: number;
      readonly medianLatencyMs: number;
      readonly hesitations: readonly Hesitation[];
    }
  | {
      readonly kind: "measured";
      readonly samples: number;
      readonly discarded: number;
      readonly medianLatencyMs: number;
      readonly wordsPerMinute: number;
      /** expected ÷ observed: above 1 is faster than the reference pace. */
      readonly paceRatio: number;
      /** 0..1, pace tempered by how evenly it was delivered. */
      readonly fluency: number;
      /** 0..1 — sample count and consistency, stated so nobody over-reads one run. */
      readonly confidence: number;
      /** Robust coefficient of variation (MAD ÷ median). */
      readonly dispersion: number;
      readonly hesitations: readonly Hesitation[];
    };

function usable(observation: FluencyObservation, config: FluencyConfig): boolean {
  return (
    Number.isFinite(observation.latencyMs) &&
    observation.latencyMs >= 0 &&
    observation.latencyMs <= config.maxPlausibleLatencyMs &&
    Number.isFinite(observation.wordIndex) &&
    observation.wordIndex >= 0
  );
}

/** Latencies from a plain list, indexed from `startIndex`. */
export function observationsFromLatencies(
  latencies: readonly number[],
  startIndex = 0,
): readonly FluencyObservation[] {
  return latencies.map((latencyMs, offset) => ({ wordIndex: startIndex + offset, latencyMs }));
}

/** Median absolute deviation — spread that a single long pause cannot inflate. */
export function medianAbsoluteDeviation(values: readonly number[], centre: number): number {
  return median(values.map((value) => Math.abs(value - centre))) ?? 0;
}

export function detectHesitations(
  observations: readonly FluencyObservation[],
  config: FluencyConfig = DEFAULT_FLUENCY_CONFIG,
): readonly Hesitation[] {
  const usableOnes = observations.filter((observation) => usable(observation, config));
  const latencies = usableOnes.map((observation) => observation.latencyMs);
  const centre = median(latencies);
  if (centre === null || centre <= 0) return [];
  const mad = medianAbsoluteDeviation(latencies, centre);
  const threshold = Math.max(
    centre * config.spikeMedianMultiple,
    centre + config.spikeMadMultiple * mad,
  );
  const hesitations: Hesitation[] = [];
  for (const observation of usableOnes) {
    if (observation.latencyMs <= threshold) continue;
    hesitations.push({
      wordIndex: observation.wordIndex,
      latencyMs: observation.latencyMs,
      ratioToMedian: roundTo(observation.latencyMs / centre, 3),
      // Saturating but strictly increasing, so the worst stall always ranks first:
      // a clamped linear excess would tie every severe stall at 1.
      severity: roundTo(clamp01(1 - threshold / Math.max(observation.latencyMs, 1)), 3),
    });
  }
  return hesitations.sort(
    (left, right) => right.severity - left.severity || left.wordIndex - right.wordIndex,
  );
}

/**
 * Measure fluency.
 *
 * Returns `not_enough_samples` rather than a small, confident-looking number when
 * the evidence is thin, and `no_expected_pace` when there is nothing to compare a
 * pace against — in both cases the hesitation analysis is still honest about what
 * it did and did not see.
 */
export function measureFluency(input: FluencyInput): FluencyResult {
  const config = input.config ?? DEFAULT_FLUENCY_CONFIG;
  const usableOnes = input.observations.filter((observation) => usable(observation, config));
  const discarded = input.observations.length - usableOnes.length;
  const samples = usableOnes.length;

  if (samples < config.minSamples) {
    return { kind: "not_enough_samples", samples, required: config.minSamples, discarded };
  }

  const latencies = usableOnes.map((observation) => observation.latencyMs);
  const centre = median(latencies) ?? 0;
  const hesitations = detectHesitations(usableOnes, config);

  if (
    input.expectedMsPerWord === null ||
    !Number.isFinite(input.expectedMsPerWord) ||
    input.expectedMsPerWord <= 0 ||
    centre <= 0
  ) {
    return {
      kind: "no_expected_pace",
      samples,
      discarded,
      medianLatencyMs: roundTo(centre, 1),
      hesitations,
    };
  }

  const mad = medianAbsoluteDeviation(latencies, centre);
  const dispersion = clamp01(mad / centre);
  const paceRatio = input.expectedMsPerWord / centre;
  const smoothness = 1 - hesitations.length / samples;
  // Pace is the body of the measure; evenness tempers it. A learner who races and
  // stalls is not fluent, however good the median looks.
  const fluency = clamp01(clamp01(paceRatio) * (0.5 + 0.5 * clamp01(smoothness)));
  const sampleConfidence = samples / (samples + config.minSamples);
  const confidence = clamp01(sampleConfidence * (0.5 + 0.5 * (1 - dispersion)));

  return {
    kind: "measured",
    samples,
    discarded,
    medianLatencyMs: roundTo(centre, 1),
    wordsPerMinute: roundTo(60_000 / centre, 2),
    paceRatio: roundTo(paceRatio, 3),
    fluency: roundTo(fluency, 3),
    confidence: roundTo(confidence, 3),
    dispersion: roundTo(dispersion, 3),
    hesitations,
  };
}

/* ------------------------------------------------------- weak-join candidates */

/** A hesitation, resolved onto the unit whose join it sits on. */
export interface HesitationSignal {
  readonly unitId: UnitId;
  readonly wordIndex: number;
  readonly severity: number;
}

/**
 * Map hesitation points onto units.
 *
 * `resolve` is supplied by the caller (only the content package knows which word
 * index begins which āyah), returning the unit a hesitation implicates — usually the
 * āyah transition the learner stalled on — or `null` to drop it. Signals for the
 * same unit are merged, keeping the worst.
 */
export function hesitationSignals(
  hesitations: readonly Hesitation[],
  resolve: (wordIndex: number) => UnitId | null,
): readonly HesitationSignal[] {
  const worst = new Map<UnitId, HesitationSignal>();
  for (const hesitation of hesitations) {
    const unitId = resolve(hesitation.wordIndex);
    if (unitId === null) continue;
    const existing = worst.get(unitId);
    if (existing === undefined || hesitation.severity > existing.severity) {
      worst.set(unitId, {
        unitId,
        wordIndex: hesitation.wordIndex,
        severity: hesitation.severity,
      });
    }
  }
  return [...worst.values()].sort(
    (left, right) => right.severity - left.severity || (left.unitId < right.unitId ? -1 : 1),
  );
}
