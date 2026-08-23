/**
 * Evidence taxonomy.
 *
 * Core invariant: a client can only *describe* what happened; the engine
 * decides what it *means*. Any assistance during an attempt marks the
 * whole attempt assisted, and assisted attempts can never satisfy
 * independent-recall requirements — they can only inform preparation.
 */
import type {
  AttemptId,
  ConfidenceJudgment,
  EpochMs,
  MemoryTargetId,
  ScaffoldLevel,
  StartContext,
} from "./types.js";
import { CUE_FREE_LEVELS } from "./types.js";

export type AssistanceKind =
  | "hint"
  | "revealed_anchor"
  | "replayed_word"
  | "answer_exposed"
  | "tile_options_visible";

export interface RetrievalAttempt {
  attemptId: AttemptId;
  targetId: MemoryTargetId;
  occurredAt: EpochMs;
  scaffoldLevel: ScaffoldLevel;
  startContext: StartContext;
  correct: boolean;
  /** Every assistance event observed during the attempt. */
  assistance: readonly AssistanceKind[];
  /** Meaningful hesitation detected by grading rules (not raw latency). */
  hesitant: boolean;
  confidence?: ConfidenceJudgment;
}

export type EvidenceClass =
  | "independent_recall"
  | "assisted_practice"
  | "scaffolded_practice";

/**
 * Classify an attempt. Tile reconstruction (any level where answer
 * options are visible) is scaffolded retrieval: useful practice, never
 * proof of independent recall.
 */
export function classifyAttempt(a: RetrievalAttempt): EvidenceClass {
  if (a.assistance.length > 0) return "assisted_practice";
  if (!CUE_FREE_LEVELS.has(a.scaffoldLevel)) return "scaffolded_practice";
  return "independent_recall";
}

export function isIndependentRecall(a: RetrievalAttempt): boolean {
  return classifyAttempt(a) === "independent_recall";
}

/**
 * Evidence policy attached to an assignment (versioned; changes create a
 * new policy version — the engine only ever sees one resolved policy).
 */
export interface EvidencePolicy {
  policyVersion: string;
  /** Cue-free correct recalls required before "ready for verification". */
  requiredIndependentRecalls: number;
  /** At least this many of them must be random-start or boundary probes. */
  requiredNonSerialRecalls: number;
  /** Minimum listens before reconstruction may begin. */
  requiredListens: number;
}

export interface EvidenceProgress {
  independentRecalls: number;
  nonSerialIndependentRecalls: number;
  listensCompleted: number;
}

/**
 * Whether the accumulated evidence satisfies the policy threshold for
 * "ready for verification". Pure aggregation — no state transition here.
 */
export function meetsVerificationThreshold(
  progress: EvidenceProgress,
  policy: EvidencePolicy,
): boolean {
  return (
    progress.listensCompleted >= policy.requiredListens &&
    progress.independentRecalls >= policy.requiredIndependentRecalls &&
    progress.nonSerialIndependentRecalls >= policy.requiredNonSerialRecalls
  );
}

/**
 * Fold one attempt into evidence progress. Assisted and scaffolded
 * attempts never increment independent counters. Serial-start and
 * non-serial evidence are tracked separately by construction.
 */
export function accumulate(
  progress: EvidenceProgress,
  attempt: RetrievalAttempt,
): EvidenceProgress {
  if (!attempt.correct || !isIndependentRecall(attempt)) return progress;
  const nonSerial = attempt.startContext !== "serial_start";
  return {
    ...progress,
    independentRecalls: progress.independentRecalls + 1,
    nonSerialIndependentRecalls:
      progress.nonSerialIndependentRecalls + (nonSerial ? 1 : 0),
  };
}

export const emptyProgress: EvidenceProgress = {
  independentRecalls: 0,
  nonSerialIndependentRecalls: 0,
  listensCompleted: 0,
};
