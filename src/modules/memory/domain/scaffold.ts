/**
 * Scaffold fading for review-from-blank.
 *
 * The muṣḥaf page is never decorated, but it can be *withheld*. As a unit gets
 * stronger the support fades:
 *
 *   full_text → first_letters → word_count → blank
 *
 * The level is a pure, monotone function of the state's strength: more stability,
 * more retrievability or more evidence can only ever fade the scaffold further, never
 * bring it back mid-session. A unit with nothing recorded always gets the full text —
 * we never ask a learner to recite from a blank we have no evidence they can fill.
 */

import { DEFAULT_SCHEDULING_POLICY, retrievability } from "./fsrs";
import { clamp01 } from "./numeric";
import { hasEvidence, type MemoryState, type SchedulingPolicy } from "./types";

export const SCAFFOLD_LEVELS = ["full_text", "first_letters", "word_count", "blank"] as const;
export type ScaffoldLevel = (typeof SCAFFOLD_LEVELS)[number];

/** 0 = most support, 3 = none. Higher rank means the scaffold has faded further. */
export function scaffoldRank(level: ScaffoldLevel): number {
  return SCAFFOLD_LEVELS.indexOf(level);
}

export interface ScaffoldConfig {
  /** Stability, in days, that maps to a normalised strength of 0.5. */
  readonly stabilityHalfPointDays: number;
  readonly stabilityWeight: number;
  readonly retrievabilityWeight: number;
  /**
   * Strength multiplier at zero confidence. Weak evidence holds the scaffold up;
   * it never pushes it down (evidence rule).
   */
  readonly confidenceFloor: number;
  /** Ascending strength thresholds for first_letters, word_count, blank. */
  readonly thresholds: readonly [number, number, number];
}

export const DEFAULT_SCAFFOLD_CONFIG: ScaffoldConfig = {
  stabilityHalfPointDays: 21,
  stabilityWeight: 0.5,
  retrievabilityWeight: 0.5,
  confidenceFloor: 0.6,
  thresholds: [0.25, 0.5, 0.75],
};

/**
 * Strength in [0, 1]:
 *
 *   strength = (wS · S/(S + halfPoint) + wR · R) · (floor + (1 − floor) · confidence)
 *
 * Each factor is strictly increasing in its input, so `strength` — and therefore the
 * scaffold level — is monotone in stability, retrievability and confidence.
 */
export function scaffoldStrength(
  state: MemoryState,
  now: Date,
  scheduling: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
  config: ScaffoldConfig = DEFAULT_SCAFFOLD_CONFIG,
): number {
  if (!hasEvidence(state)) return 0;
  const stability = Math.max(state.stability, 0);
  const normalisedStability = stability / (stability + Math.max(config.stabilityHalfPointDays, 0.01));
  const recall = retrievability(state, now, scheduling);
  const totalWeight = config.stabilityWeight + config.retrievabilityWeight;
  const base =
    totalWeight <= 0
      ? 0
      : (config.stabilityWeight * normalisedStability + config.retrievabilityWeight * recall) /
        totalWeight;
  const evidence =
    config.confidenceFloor + (1 - config.confidenceFloor) * clamp01(state.confidence);
  return clamp01(base * evidence);
}

/** The scaffold to show for this unit right now. */
export function scaffoldLevel(
  state: MemoryState,
  now: Date,
  scheduling: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
  config: ScaffoldConfig = DEFAULT_SCAFFOLD_CONFIG,
): ScaffoldLevel {
  const strength = scaffoldStrength(state, now, scheduling, config);
  const [first, second, third] = config.thresholds;
  if (strength >= third) return "blank";
  if (strength >= second) return "word_count";
  if (strength >= first) return "first_letters";
  return "full_text";
}
