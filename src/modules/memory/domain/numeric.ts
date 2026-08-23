/**
 * Tiny numeric helpers shared by the memory engine.
 *
 * Pure: no I/O, no clock, no randomness.
 */

/** Clamp `value` into `[min, max]`. `NaN` collapses to `min` (fail safe, never silent). */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Clamp into the unit interval `[0, 1]`. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Round to `digits` decimal places (deterministic; used to keep stored state tidy). */
export function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** Mean of a list, or `null` when there is nothing to average (honesty rule). */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** Median of a list, or `null` when empty. Does not mutate the input. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return null;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1];
  if (lower === undefined) return upper;
  return (lower + upper) / 2;
}

/**
 * A rate that always carries its denominator (honesty rule): `rate` is `null`
 * — "not yet recorded" — when nothing has been observed.
 */
export interface Rate {
  readonly numerator: number;
  readonly denominator: number;
  readonly rate: number | null;
}

export function rate(numerator: number, denominator: number): Rate {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
  };
}
