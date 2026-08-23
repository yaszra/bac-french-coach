/**
 * Weak joins — where ḥifẓ actually fails.
 *
 * A learner rarely forgets an āyah. They forget which āyah comes *next*: the seam
 * between two well-held bodies. The memory engine models that seam as its own unit
 * (`t:2:255>2:256`), and this module finds the seams that materially trail the āyāt
 * they join.
 *
 * Two independent signals, because they fail at different times:
 *
 * - **retrievability gap** — the join is recallable right now to a materially lower
 *   degree than the weaker of its two bodies.
 * - **stability gap** — the join was reviewed recently (so it looks fine today) but
 *   its stability is a fraction of the bodies'. It will fall over first.
 *
 * A seam that has never been practised while both its bodies are strong is reported
 * too, but honestly: `basis: "not_yet_recorded"` with `joinRetrievability: null`. We
 * do not print zero for something nobody has measured.
 *
 * Optional hesitation signals from `fluency.ts` (a stall in a recitation, resolved
 * onto the join it sat on) raise a join's rank; they never create one on their own,
 * because a pause is an observation about one performance, not about memory.
 *
 * Pure: no clock (the caller passes `now`), no I/O, no memory writes.
 */

import { retrievability, DEFAULT_SCHEDULING_POLICY } from "@/modules/memory/domain/fsrs";
import { stateMapOf } from "@/modules/memory/domain/graph";
import { clamp01, roundTo } from "@/modules/memory/domain/numeric";
import { bodiesOfTransition, hasEvidence, reason } from "@/modules/memory/domain/types";
import type {
  MemoryState,
  Reason,
  SchedulingPolicy,
  UnitId,
} from "@/modules/memory/domain/types";
import type { HesitationSignal } from "./fluency";

export interface WeakJoinConfig {
  /**
   * Retrievability the join must trail its bodies by. Kept below
   * `1 − targetRetention` (0.10 at the default 0.90 retention), or a join that is
   * merely not-yet-due could never qualify.
   */
  readonly margin: number;
  /** Stability below this share of the bodies' is a weak seam, however fresh. */
  readonly stabilityRatioThreshold: number;
  /** Bodies must be at least this recallable before an unpractised seam is reported. */
  readonly unrecordedBodyFloor: number;
  /** How much a hesitation signal may add to a join's severity. */
  readonly hesitationWeight: number;
}

export const DEFAULT_WEAK_JOIN_CONFIG: WeakJoinConfig = {
  margin: 0.05,
  stabilityRatioThreshold: 0.5,
  unrecordedBodyFloor: 0.6,
  hesitationWeight: 0.2,
};

export type WeakJoinBasis = "measured" | "not_yet_recorded";

export interface WeakJoin {
  readonly unitId: UnitId;
  readonly bodies: readonly [UnitId, UnitId];
  readonly basis: WeakJoinBasis;
  /** `null` when the seam has never been recorded — never a stand-in zero. */
  readonly joinRetrievability: number | null;
  /** The weaker of the two bodies: a chain is judged by its weaker anchor. */
  readonly bodyRetrievability: number;
  readonly gap: number | null;
  /** Join stability over the weaker body's stability, or `null` when unrecorded. */
  readonly stabilityRatio: number | null;
  /** Hesitation severity that reinforced this join, or `null` when none. */
  readonly hesitation: number | null;
  /** 0..1, for ranking. Rank order, not a probability. */
  readonly severity: number;
  /** i18n key + params, for the teacher's "why this?". */
  readonly reason: Reason;
}

export interface WeakJoinInput {
  readonly now: Date;
  readonly transitions: readonly MemoryState[];
  readonly bodies: readonly MemoryState[];
  readonly config?: WeakJoinConfig;
  readonly scheduling?: SchedulingPolicy;
  /** Report seams nobody has practised yet. Default `true`. */
  readonly includeUnrecorded?: boolean;
  readonly hesitations?: readonly HesitationSignal[];
  /** Cap the list; the ranking is stable, so a cap is a top-N. */
  readonly limit?: number;
}

/** Split a mixed state list into the two lists this module wants. */
export function splitByKind(states: readonly MemoryState[]): {
  readonly transitions: readonly MemoryState[];
  readonly bodies: readonly MemoryState[];
} {
  return {
    transitions: states.filter((state) => state.kind === "ayah_transition"),
    bodies: states.filter((state) => state.kind === "ayah_body"),
  };
}

/**
 * The joins that materially trail their bodies, worst first.
 *
 * A uniformly strong page produces an empty list: no gap, no claim.
 */
export function weakJoins(input: WeakJoinInput): readonly WeakJoin[] {
  const config = input.config ?? DEFAULT_WEAK_JOIN_CONFIG;
  const scheduling = input.scheduling ?? DEFAULT_SCHEDULING_POLICY;
  const includeUnrecorded = input.includeUnrecorded ?? true;
  const bodyStates = stateMapOf(input.bodies);
  const hesitationByUnit = new Map<UnitId, number>();
  for (const signal of input.hesitations ?? []) {
    const existing = hesitationByUnit.get(signal.unitId) ?? 0;
    hesitationByUnit.set(signal.unitId, Math.max(existing, clamp01(signal.severity)));
  }

  const found: WeakJoin[] = [];
  for (const transition of input.transitions) {
    if (transition.kind !== "ayah_transition") continue;
    const pair = bodiesOfTransition(transition.unitId);
    if (pair === null) continue;
    const [beforeId, afterId] = pair;
    const before = bodyStates.get(beforeId);
    const after = bodyStates.get(afterId);
    // Without both bodies there is nothing to compare against, so nothing is claimed.
    if (before === undefined || after === undefined) continue;
    if (!hasEvidence(before) || !hasEvidence(after)) continue;

    const bodyRecall = Math.min(
      retrievability(before, input.now, scheduling),
      retrievability(after, input.now, scheduling),
    );
    const bodyStability = Math.min(before.stability, after.stability);
    const hesitation = hesitationByUnit.get(transition.unitId) ?? null;

    if (!hasEvidence(transition)) {
      if (!includeUnrecorded) continue;
      if (bodyRecall < config.unrecordedBodyFloor) continue;
      const severity = clamp01(0.5 * bodyRecall + config.hesitationWeight * (hesitation ?? 0));
      found.push({
        unitId: transition.unitId,
        bodies: pair,
        basis: "not_yet_recorded",
        joinRetrievability: null,
        bodyRetrievability: roundTo(bodyRecall, 3),
        gap: null,
        stabilityRatio: null,
        hesitation,
        severity: roundTo(severity, 3),
        reason: reason("hifz.weak_join.not_yet_recorded", {
          unitId: transition.unitId,
          bodyRetrievability: roundTo(bodyRecall, 2),
        }),
      });
      continue;
    }

    const joinRecall = retrievability(transition, input.now, scheduling);
    const gap = bodyRecall - joinRecall;
    const stabilityRatio = bodyStability > 0 ? transition.stability / bodyStability : 1;
    const gapFlag = gap > config.margin;
    const stabilityFlag = stabilityRatio < config.stabilityRatioThreshold;
    if (!gapFlag && !stabilityFlag) continue;

    const gapSeverity = gapFlag ? clamp01(gap) : 0;
    const stabilitySeverity = stabilityFlag ? clamp01(1 - stabilityRatio) : 0;
    const severity = clamp01(
      Math.max(gapSeverity, stabilitySeverity) + config.hesitationWeight * (hesitation ?? 0),
    );

    found.push({
      unitId: transition.unitId,
      bodies: pair,
      basis: "measured",
      joinRetrievability: roundTo(joinRecall, 3),
      bodyRetrievability: roundTo(bodyRecall, 3),
      gap: roundTo(gap, 3),
      stabilityRatio: roundTo(stabilityRatio, 3),
      hesitation,
      severity: roundTo(severity, 3),
      reason: gapFlag
        ? reason("hifz.weak_join.retrievability_gap", {
            unitId: transition.unitId,
            joinRetrievability: roundTo(joinRecall, 2),
            bodyRetrievability: roundTo(bodyRecall, 2),
            gap: roundTo(gap, 2),
            margin: config.margin,
          })
        : reason("hifz.weak_join.stability_gap", {
            unitId: transition.unitId,
            joinStability: roundTo(transition.stability, 2),
            bodyStability: roundTo(bodyStability, 2),
            stabilityRatio: roundTo(stabilityRatio, 2),
          }),
    });
  }

  found.sort(
    (left, right) =>
      right.severity - left.severity ||
      (left.unitId < right.unitId ? -1 : left.unitId > right.unitId ? 1 : 0),
  );
  return input.limit === undefined ? found : found.slice(0, Math.max(0, input.limit));
}
