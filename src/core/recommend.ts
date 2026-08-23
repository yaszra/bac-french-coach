/**
 * Recommendation ranking and the learner's Today plan.
 *
 * Pure and deterministic. Two rules shape everything here:
 *
 *  1. Prefer the *weakest useful evidence*, not merely the oldest date.
 *  2. A capped queue must say what it deferred. Never mark deferred work
 *     complete, and never silently hide it.
 */
import type {
  EpochMs,
  LearningState,
  MemoryTargetId,
  MemoryTargetKind,
} from "./types.js";
import type { SchedulingState } from "./scheduler.js";
import { predictRecall, params as schedulerParams } from "./scheduler.js";

export const RECOMMENDER_VERSION = "athar-recommender/1.0.0";

export interface Candidate {
  targetId: MemoryTargetId;
  kind: MemoryTargetKind;
  state: LearningState;
  /**
   * Display reference only — e.g. "Al-Mulk 12-15".
   * Never Qur'anic text: no sacred string passes through the engine.
   */
  label: string;
  estimatedActiveMinutes: number;
  /** Present once a human verification has established a baseline. */
  scheduling?: SchedulingState;
  /** Teacher pin, 0..1. Suppressed targets are filtered before ranking. */
  teacherPriority: number;
  unresolvedCorrections: number;
  /** How many times the same correction category has recurred. */
  correctionRecurrences: number;
  /** 0..1, from the knowledge graph. */
  prerequisiteWeakness: number;
  /** 0..1, connection-boundary weakness. */
  connectionWeakness: number;
  /** True when an adult assigned this and it is not yet satisfied. */
  isAssignmentObligation: boolean;
}

export interface RankingWeights {
  obligation: number;
  forgettingRisk: number;
  correctionPressure: number;
  prerequisiteWeakness: number;
  connectionWeakness: number;
  teacherPriority: number;
}

export const defaultWeights: RankingWeights = {
  obligation: 1.0,
  forgettingRisk: 0.9,
  correctionPressure: 0.8,
  prerequisiteWeakness: 0.6,
  connectionWeakness: 0.55,
  teacherPriority: 0.7,
};

export interface RankedCandidate {
  candidate: Candidate;
  score: number;
  /** Human-readable, shown to the learner and the teacher. */
  reason: string;
  components: Record<keyof RankingWeights, number>;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** 1 − predicted recall. Zero when no verified baseline exists yet. */
export function forgettingRisk(c: Candidate, now: EpochMs): number {
  if (!c.scheduling) return 0;
  return clamp01(1 - predictRecall(c.scheduling, now));
}

/** Recurrence matters more than a single unresolved note. */
function correctionPressure(c: Candidate): number {
  return clamp01(c.correctionRecurrences * 0.3 + c.unresolvedCorrections * 0.15);
}

function daysOverdue(c: Candidate, now: EpochMs): number {
  if (!c.scheduling) return 0;
  return Math.max(0, (now - c.scheduling.nextReviewAt) / 86_400_000);
}

/**
 * The reason string names the single largest contributor, then adds the
 * one fact a human most needs. Never expose the raw score: opaque
 * pseudo-precision is worse than an honest sentence.
 */
function explain(
  c: Candidate,
  components: Record<keyof RankingWeights, number>,
  now: EpochMs,
): string {
  const entries = Object.entries(components) as [keyof RankingWeights, number][];
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = entries[0];
  const overdue = daysOverdue(c, now);

  if (!top || top[1] <= 0) return "Scheduled practice.";

  switch (top[0]) {
    case "obligation":
      return c.state === "assigned"
        ? "Assigned by your teacher and not started yet."
        : "Assigned work still needs evidence before verification.";
    case "forgettingRisk": {
      const recall = c.scheduling
        ? Math.round(predictRecall(c.scheduling, now) * 100)
        : null;
      const when = overdue >= 1 ? `${Math.round(overdue)}d overdue` : "due now";
      return recall === null
        ? `Review ${when}.`
        : `Review ${when}: predicted recall has fallen to about ${recall}%.`;
    }
    case "correctionPressure":
      return c.correctionRecurrences > 1
        ? `The same correction has recurred ${c.correctionRecurrences} times here.`
        : "A correction from your teacher is still open here.";
    case "prerequisiteWeakness":
      return "A reading prerequisite for this passage is still weak.";
    case "connectionWeakness":
      return "The join into this passage needs another clean recall.";
    case "teacherPriority":
      return "Your teacher prioritised this.";
  }
}

export function rank(
  candidates: readonly Candidate[],
  now: EpochMs,
  weights: RankingWeights = defaultWeights,
): RankedCandidate[] {
  const ranked = candidates.map((c) => {
    const components: Record<keyof RankingWeights, number> = {
      obligation: c.isAssignmentObligation ? 1 : 0,
      forgettingRisk: forgettingRisk(c, now),
      correctionPressure: correctionPressure(c),
      prerequisiteWeakness: clamp01(c.prerequisiteWeakness),
      connectionWeakness: clamp01(c.connectionWeakness),
      teacherPriority: clamp01(c.teacherPriority),
    };
    const weighted: Record<keyof RankingWeights, number> = {
      obligation: components.obligation * weights.obligation,
      forgettingRisk: components.forgettingRisk * weights.forgettingRisk,
      correctionPressure:
        components.correctionPressure * weights.correctionPressure,
      prerequisiteWeakness:
        components.prerequisiteWeakness * weights.prerequisiteWeakness,
      connectionWeakness:
        components.connectionWeakness * weights.connectionWeakness,
      teacherPriority: components.teacherPriority * weights.teacherPriority,
    };
    const score = Object.values(weighted).reduce((a, b) => a + b, 0);
    return {
      candidate: c,
      score: round2(score),
      reason: explain(c, weighted, now),
      components: weighted,
    };
  });

  // Stable and deterministic: ties break on targetId, never on input order.
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      a.candidate.targetId.localeCompare(b.candidate.targetId),
  );
  return ranked;
}

/** Buckets used to keep a session from becoming all-repair or all-new. */
export type DiversityBucket = "new" | "recent" | "mature" | "repair";

export function bucketOf(state: LearningState): DiversityBucket {
  switch (state) {
    case "assigned":
    case "preparing":
      return "new";
    case "recalled_independently":
    case "ready_for_verification":
    case "verified":
      return "recent";
    case "established":
    case "durable":
      return "mature";
    case "fragile":
    case "repairing":
      return "repair";
  }
}

export interface TodayPlan {
  /** The single primary CTA. Exactly one, or none. */
  continueNow?: RankedCandidate;
  newMemory?: RankedCandidate;
  keepStrong: RankedCandidate[];
  /** Items that did not fit the budget. Explicitly stated, never hidden. */
  deferred: RankedCandidate[];
  totalEstimatedActiveMinutes: number;
  /** Plain-language note shown whenever anything was deferred. */
  cappedNotice?: string;
  recommenderVersion: string;
}

export interface TodayOptions {
  now: EpochMs;
  /** Effort target in *active* minutes — never a screen-time target. */
  sessionBudgetMinutes: number;
  weights?: RankingWeights;
  /** Teacher-suppressed targets; filtered before ranking, with an audit trail. */
  suppressedTargetIds?: ReadonlySet<MemoryTargetId>;
  /** Upper bound on "Keep strong" rows, so the page stays calm. */
  maxKeepStrong?: number;
}

/**
 * Assemble the learner's Today.
 *
 * Selection is budget-aware and diversity-aware: we round-robin across
 * buckets in score order rather than draining the highest-scoring bucket,
 * so a learner with a large repair backlog still meets new and mature
 * material.
 */
export function buildTodayPlan(
  candidates: readonly Candidate[],
  opts: TodayOptions,
): TodayPlan {
  const suppressed = opts.suppressedTargetIds ?? new Set<MemoryTargetId>();
  const visible = candidates.filter((c) => !suppressed.has(c.targetId));
  const ranked = rank(visible, opts.now, opts.weights);

  const byBucket = new Map<DiversityBucket, RankedCandidate[]>();
  for (const r of ranked) {
    const b = bucketOf(r.candidate.state);
    const list = byBucket.get(b);
    if (list) list.push(r);
    else byBucket.set(b, [r]);
  }

  const order: DiversityBucket[] = ["repair", "recent", "mature", "new"];
  const selected: RankedCandidate[] = [];
  const deferred: RankedCandidate[] = [];
  let budget = opts.sessionBudgetMinutes;
  const maxKeepStrong = opts.maxKeepStrong ?? 5;

  // Round-robin across buckets until the budget or the row cap is reached.
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const b of order) {
      const list = byBucket.get(b);
      if (!list || list.length === 0) continue;
      const next = list[0];
      if (!next) continue;
      if (
        next.candidate.estimatedActiveMinutes <= budget &&
        selected.length < maxKeepStrong + 2
      ) {
        list.shift();
        selected.push(next);
        budget -= next.candidate.estimatedActiveMinutes;
        progressed = true;
      }
    }
  }
  for (const list of byBucket.values()) deferred.push(...list);
  deferred.sort(
    (a, b) =>
      b.score - a.score ||
      a.candidate.targetId.localeCompare(b.candidate.targetId),
  );

  // Present in the fixed Today order from docs/03-wireframes.md.
  const newMemory = selected.find((r) => r.candidate.state === "assigned");
  const continueNow = selected.find((r) => r !== newMemory);
  const keepStrong = selected
    .filter((r) => r !== newMemory && r !== continueNow)
    .slice(0, maxKeepStrong);

  const plan: TodayPlan = {
    keepStrong,
    deferred,
    totalEstimatedActiveMinutes: selected.reduce(
      (sum, r) => sum + r.candidate.estimatedActiveMinutes,
      0,
    ),
    recommenderVersion: RECOMMENDER_VERSION,
  };
  if (continueNow) plan.continueNow = continueNow;
  if (newMemory) plan.newMemory = newMemory;
  if (deferred.length > 0)
    plan.cappedNotice =
      `${deferred.length} more ${deferred.length === 1 ? "item is" : "items are"} due but did not fit today's ` +
      `${opts.sessionBudgetMinutes}-minute effort target. They remain due and are not marked complete.`;
  return plan;
}

/** Targets whose predicted recall has dropped below the policy floor. */
export function fragileTargets(
  candidates: readonly Candidate[],
  now: EpochMs,
): Candidate[] {
  return candidates.filter(
    (c) =>
      c.scheduling !== undefined &&
      predictRecall(c.scheduling, now) < schedulerParams.fragileRetrievabilityFloor,
  );
}
