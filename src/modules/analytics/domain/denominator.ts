/**
 * Every rate in Itqān carries the count it was computed from.
 *
 * This exists because "85% accuracy" over four attempts and over four hundred
 * are different claims, and a parent reading a report cannot tell them apart
 * unless we say so. A rate with too little behind it does not become a smaller
 * number — it becomes "not yet recorded".
 */
export type Measured =
  | { readonly kind: "measured"; readonly value: number; readonly numerator: number; readonly denominator: number }
  | { readonly kind: "not_yet_recorded"; readonly denominator: number; readonly needed: number };

/** Below this many observations we do not claim a rate at all. */
export const MINIMUM_OBSERVATIONS = 5;

export function rate(numerator: number, denominator: number, minimum = MINIMUM_OBSERVATIONS): Measured {
  if (denominator < minimum) {
    return { kind: "not_yet_recorded", denominator, needed: minimum - denominator };
  }
  return { kind: "measured", value: numerator / denominator, numerator, denominator };
}

export function isMeasured(m: Measured): m is Extract<Measured, { kind: "measured" }> {
  return m.kind === "measured";
}

/** Formatting belongs to the UI; this only ever yields the parts. */
export function parts(m: Measured): { percent: number | null; numerator: number | null; denominator: number } {
  return isMeasured(m)
    ? { percent: Math.round(m.value * 100), numerator: m.numerator, denominator: m.denominator }
    : { percent: null, numerator: null, denominator: m.denominator };
}
