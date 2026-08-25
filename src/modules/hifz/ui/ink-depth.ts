/**
 * Ink depth from memory state.
 *
 * The muṣḥaf page has exactly one progress language: the alpha of the ink. This
 * module is the only place that decides which rung of the 0–5 ladder a word sits
 * on, and it is a pure function of the server's `MemoryState`.
 *
 * Two honesty rules are load-bearing here:
 *
 *   · Depth 0 means "not yet recorded", and nothing else. A unit with no row, or
 *     a row with no reps, is 0 — never a flattering 1.
 *   · A unit that HAS evidence is never 0. Depth 0 blanks the word's space on the
 *     page, so returning it for a practised āyah would erase real work.
 *
 * Depth is therefore 0, or 1–5. There is no other outcome.
 *
 * Pure: no clock of its own, no I/O, no randomness.
 */

import { DEFAULT_SCHEDULING_POLICY, retrievability } from "@/modules/memory/domain/fsrs";
import { clamp01 } from "@/modules/memory/domain/numeric";
import { hasEvidence, type MemoryState, type SchedulingPolicy } from "@/modules/memory/domain/types";
import { toInkDepth, type InkDepth } from "@/modules/design/ui/mushaf/types";

export interface InkDepthConfig {
  /** Stability, in days, that maps to a normalised stability of 0.5. */
  readonly stabilityHalfPointDays: number;
  readonly stabilityWeight: number;
  readonly retrievabilityWeight: number;
  /**
   * Strength multiplier at zero confidence. Thin evidence can only ever hold the
   * ink back; it never darkens it (evidence rule).
   */
  readonly confidenceFloor: number;
  /**
   * Ascending strength thresholds for depths 2, 3, 4 and 5. Anything with
   * evidence but below the first threshold is depth 1 — faint, but present.
   */
  readonly thresholds: readonly [number, number, number, number];
}

export const DEFAULT_INK_DEPTH_CONFIG: InkDepthConfig = {
  stabilityHalfPointDays: 21,
  stabilityWeight: 0.5,
  retrievabilityWeight: 0.5,
  confidenceFloor: 0.5,
  thresholds: [0.2, 0.4, 0.6, 0.8],
};

/**
 * Strength in [0, 1] behind the ink.
 *
 *   strength = (wS · S/(S + half) + wR · R) / (wS + wR) · (floor + (1 − floor) · c)
 *
 * Every factor is strictly increasing in its input, so strength — and with it the
 * depth — is monotone in stability, retrievability and confidence. Ink can only
 * get darker as a learner gets stronger.
 */
export function inkStrength(
  state: MemoryState,
  now: Date,
  scheduling: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
  config: InkDepthConfig = DEFAULT_INK_DEPTH_CONFIG,
): number {
  if (!hasEvidence(state)) return 0;
  const stability = Math.max(state.stability, 0);
  const half = Math.max(config.stabilityHalfPointDays, 0.01);
  const normalisedStability = stability / (stability + half);
  const recall = clamp01(retrievability(state, now, scheduling));
  const totalWeight = config.stabilityWeight + config.retrievabilityWeight;
  const base =
    totalWeight <= 0
      ? 0
      : (config.stabilityWeight * normalisedStability + config.retrievabilityWeight * recall) /
        totalWeight;
  const evidence = config.confidenceFloor + (1 - config.confidenceFloor) * clamp01(state.confidence);
  return clamp01(base * evidence);
}

/**
 * The depth to draw a unit's words at.
 *
 * `undefined` — no row at all — is depth 0, exactly like a row with nothing
 * recorded: both mean "not yet recorded", and the page says so by leaving the
 * word's space blank.
 */
export function inkDepthOf(
  state: MemoryState | undefined,
  now: Date,
  scheduling: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
  config: InkDepthConfig = DEFAULT_INK_DEPTH_CONFIG,
): InkDepth {
  if (state === undefined || !hasEvidence(state)) return 0;
  const strength = inkStrength(state, now, scheduling, config);
  const [second, third, fourth, fifth] = config.thresholds;
  if (strength >= fifth) return 5;
  if (strength >= fourth) return 4;
  if (strength >= third) return 3;
  if (strength >= second) return 2;
  // Evidence exists, so the word is earned: 1 is the floor, never 0.
  return 1;
}

/**
 * Depth for a whole passage, given the states of the units it spans.
 *
 * A passage is only as strong as its weakest recorded unit — a page that reads
 * "held" because of its first āyah would be a lie about the rest of it. A passage
 * with nothing recorded anywhere is 0.
 */
export function passageInkDepth(
  states: readonly (MemoryState | undefined)[],
  now: Date,
  scheduling: SchedulingPolicy = DEFAULT_SCHEDULING_POLICY,
  config: InkDepthConfig = DEFAULT_INK_DEPTH_CONFIG,
): InkDepth {
  const depths = states.map((state) => inkDepthOf(state, now, scheduling, config));
  if (depths.length === 0) return 0;
  return toInkDepth(Math.min(...depths));
}

/**
 * The khatma / read view: full ink, always.
 *
 * Reading is not testing. A learner who opens the muṣḥaf to read is given the
 * whole page, whatever their memory state says — the ink ladder is for practice.
 */
export const READ_VIEW_DEPTH: InkDepth = 5;

export type QuranView = "memory" | "read";

export function isQuranView(value: string | undefined): value is QuranView {
  return value === "memory" || value === "read";
}

/** Depth for one word, honouring the view. `read` overrides everything. */
export function wordDepthFor(view: QuranView, memoryDepth: InkDepth): InkDepth {
  return view === "read" ? READ_VIEW_DEPTH : memoryDepth;
}
