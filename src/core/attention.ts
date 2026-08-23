/**
 * Teacher attention engine.
 *
 * Replaces dashboard sprawl with an ordered inbox. Two rules govern
 * everything here:
 *
 *  1. Every row carries evidence, a confidence, and exactly one action.
 *     There is no black-box "at-risk" label.
 *  2. Confidence is derived from how much evidence backs the claim. A
 *     *fact* (a request is waiting) is high confidence. An *inference*
 *     (recall is declining) earns its confidence from sample size, and
 *     below the minimum sample the row is not emitted at all.
 *
 * Pure and deterministic, like the rest of `src/core`.
 */
import type { CorrectionCategory, EpochMs, LearnerId } from "./types.js";
import { MS_PER_DAY } from "./types.js";

export const ATTENTION_VERSION = "athar-attention/1.0.0";

/**
 * The inbox order is fixed and not configurable in v1. A teacher who can
 * reorder their inbox has to decide what matters before they can work.
 */
export const ATTENTION_ORDER = [
  "awaiting_verification",
  "repeated_corrections",
  "recall_decline",
  "not_started",
  "review_overload",
  "inactivity",
  "governance_request",
  "recently_improved",
] as const;

export type AttentionCategory = (typeof ATTENTION_ORDER)[number];

/**
 * `high` is reserved for facts the system observed directly.
 * Inferences never reach `high` on their own.
 */
export type Confidence = "high" | "medium" | "low";

export interface EvidenceItem {
  /** Plain-language statement. Always carries its denominator. */
  statement: string;
  /** How many observations back it. Shown to the teacher on request. */
  observations: number;
}

export interface AttentionAction {
  label: string;
  /** Route from docs/02-ia-routes.md. */
  route: string;
}

export interface AttentionRow {
  category: AttentionCategory;
  learnerId: LearnerId;
  learnerName: string;
  /** One-line summary. Never a bare score or an unexplained label. */
  headline: string;
  evidence: readonly EvidenceItem[];
  confidence: Confidence;
  action: AttentionAction;
  /** Sort key within a category; higher is more urgent. */
  urgency: number;
}

export interface DelayedRecallObservation {
  correct: boolean;
  occurredAt: EpochMs;
}

export interface CorrectionObservation {
  category: CorrectionCategory;
  addedAt: EpochMs;
  resolvedAt: EpochMs | null;
}

export interface PendingVerification {
  requestId: string;
  /** Display reference such as "Al-Mulk 12-15". Never sacred text. */
  label: string;
  requestedAt: EpochMs;
}

export interface AssignmentSnapshot {
  assignmentId: string;
  label: string;
  assignedAt: EpochMs;
  dueAt: EpochMs;
  started: boolean;
}

export interface GovernanceRequest {
  kind: "guardian_claim" | "tutoring_grant" | "data_export" | "deletion";
  requestedAt: EpochMs;
}

export interface LearnerSnapshot {
  learnerId: LearnerId;
  /** Teacher-facing display name. */
  displayName: string;
  pendingVerifications: readonly PendingVerification[];
  corrections: readonly CorrectionObservation[];
  assignments: readonly AssignmentSnapshot[];
  dueReviewCount: number;
  overdueReviewCount: number;
  /** Null means no recorded activity at all — a real, displayable state. */
  lastActiveAt: EpochMs | null;
  /** Most recent first is not required; the engine sorts. */
  delayedRecalls: readonly DelayedRecallObservation[];
  governanceRequests: readonly GovernanceRequest[];
}

export const attentionParams = {
  /** A correction category seen this many times is a pattern, not noise. */
  correctionRecurrenceThreshold: 2,
  /** Below this many delayed recalls we will not claim a trend at all. */
  minRecallsForTrendClaim: 4,
  /** Overdue reviews above this are an overload worth a teacher's attention. */
  reviewOverloadThreshold: 12,
  /** Days without recorded activity before it is worth surfacing. */
  inactivityDays: 5,
  /** Days a verification request may wait before it is urgent. */
  verificationAgingDays: 2,
  /** Improvement worth naming: this many consecutive clean delayed recalls. */
  improvementStreak: 3,
} as const;

/** Confidence never exceeds the weaker of two independent grounds. */
const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
function weakerOf(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

const days = (from: EpochMs, to: EpochMs): number =>
  Math.max(0, (to - from) / MS_PER_DAY);

const round1 = (v: number): number => Math.round(v * 10) / 10;

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Category builders. Each returns zero or more rows; returning none is the
// correct answer when evidence is insufficient.
// ---------------------------------------------------------------------------

function awaitingVerification(s: LearnerSnapshot, now: EpochMs): AttentionRow[] {
  if (s.pendingVerifications.length === 0) return [];
  const oldest = [...s.pendingVerifications].sort(
    (a, b) => a.requestedAt - b.requestedAt,
  )[0]!;
  const waited = days(oldest.requestedAt, now);
  const hours = Math.round(waited * 24);
  return [
    {
      category: "awaiting_verification",
      learnerId: s.learnerId,
      learnerName: s.displayName,
      headline: `${oldest.label} is waiting for your ear.`,
      evidence: [
        {
          statement: `Requested ${hours < 24 ? `${hours}h` : `${round1(waited)}d`} ago.`,
          observations: s.pendingVerifications.length,
        },
        {
          statement: plural(
            s.pendingVerifications.length,
            "passage waiting",
            "passages waiting",
          ),
          observations: s.pendingVerifications.length,
        },
      ],
      // A waiting request is an observed fact, not an inference.
      confidence: "high",
      action: { label: "Verify", route: `/teach/verify/${oldest.requestId}` },
      urgency: waited,
    },
  ];
}

function repeatedCorrections(s: LearnerSnapshot): AttentionRow[] {
  const byCategory = new Map<CorrectionCategory, CorrectionObservation[]>();
  for (const c of s.corrections) {
    const list = byCategory.get(c.category);
    if (list) list.push(c);
    else byCategory.set(c.category, [c]);
  }

  const rows: AttentionRow[] = [];
  for (const [category, items] of byCategory) {
    if (items.length < attentionParams.correctionRecurrenceThreshold) continue;
    const unresolved = items.filter((i) => i.resolvedAt === null);
    if (unresolved.length === 0) continue;

    const span = days(
      Math.min(...items.map((i) => i.addedAt)),
      Math.max(...items.map((i) => i.addedAt)),
    );
    rows.push({
      category: "repeated_corrections",
      learnerId: s.learnerId,
      learnerName: s.displayName,
      headline: `"${category}" has been corrected ${items.length} times.`,
      evidence: [
        {
          statement: `${items.length} corrections of this type over ${round1(span)} days.`,
          observations: items.length,
        },
        {
          statement: `${unresolved.length} still unresolved.`,
          observations: unresolved.length,
        },
      ],
      // Recurrence is counted, not inferred, but its significance grows
      // with the count.
      confidence: items.length >= 3 ? "high" : "medium",
      action: {
        label: "Open profile",
        route: `/teach/learners/${s.learnerId}`,
      },
      urgency: items.length * 10 + unresolved.length,
    });
  }
  return rows;
}

/**
 * Recall decline.
 *
 * This is the only genuinely inferential row, so it is the most tightly
 * gated: below the minimum sample we emit nothing at all rather than a
 * low-confidence guess. Comparing halves is deliberately crude and
 * legible — a teacher can check it by eye.
 */
function recallDecline(s: LearnerSnapshot): AttentionRow[] {
  const sorted = [...s.delayedRecalls].sort((a, b) => a.occurredAt - b.occurredAt);
  if (sorted.length < attentionParams.minRecallsForTrendClaim) return [];

  const mid = Math.floor(sorted.length / 2);
  const earlier = sorted.slice(0, mid);
  const later = sorted.slice(mid);
  const rate = (xs: DelayedRecallObservation[]) =>
    xs.filter((x) => x.correct).length / xs.length;

  const before = rate(earlier);
  const after = rate(later);
  if (after >= before) return [];

  const drop = before - after;

  // Sample size caps confidence before magnitude is considered. A 50% drop
  // across four observations is one extra miss, which is noise — so the
  // ceiling for a small sample is `low` however dramatic the ratio looks.
  const ceilingFromSample: Confidence =
    sorted.length >= 8 ? "high" : sorted.length >= 6 ? "medium" : "low";
  const fromMagnitude: Confidence =
    drop >= 0.4 ? "high" : drop >= 0.2 ? "medium" : "low";
  const confidence = weakerOf(ceilingFromSample, fromMagnitude);

  return [
    {
      category: "recall_decline",
      learnerId: s.learnerId,
      learnerName: s.displayName,
      headline: "Delayed recall has slipped recently.",
      evidence: [
        {
          statement: `Earlier: ${earlier.filter((x) => x.correct).length} of ${earlier.length} recalled.`,
          observations: earlier.length,
        },
        {
          statement: `Recently: ${later.filter((x) => x.correct).length} of ${later.length} recalled.`,
          observations: later.length,
        },
        {
          statement: `Based on ${sorted.length} delayed recalls in total.`,
          observations: sorted.length,
        },
      ],
      confidence,
      action: { label: "Open profile", route: `/teach/learners/${s.learnerId}` },
      urgency: drop * 100 + sorted.length,
    },
  ];
}

function notStarted(s: LearnerSnapshot, now: EpochMs): AttentionRow[] {
  const unstarted = s.assignments.filter((a) => !a.started);
  if (unstarted.length === 0) return [];
  const oldest = [...unstarted].sort((a, b) => a.assignedAt - b.assignedAt)[0]!;
  const waiting = days(oldest.assignedAt, now);
  const overdue = now > oldest.dueAt;
  return [
    {
      category: "not_started",
      learnerId: s.learnerId,
      learnerName: s.displayName,
      headline: `${oldest.label} has not been opened.`,
      evidence: [
        {
          statement: `Assigned ${round1(waiting)} days ago${overdue ? ", now past its due date" : ""}.`,
          observations: 1,
        },
        {
          statement: plural(unstarted.length, "assignment not started", "assignments not started"),
          observations: unstarted.length,
        },
      ],
      confidence: "high",
      action: { label: "Open profile", route: `/teach/learners/${s.learnerId}` },
      urgency: waiting + (overdue ? 100 : 0),
    },
  ];
}

function reviewOverload(s: LearnerSnapshot): AttentionRow[] {
  if (s.overdueReviewCount < attentionParams.reviewOverloadThreshold) return [];
  return [
    {
      category: "review_overload",
      learnerId: s.learnerId,
      learnerName: s.displayName,
      headline: "The review queue has grown beyond a realistic session.",
      evidence: [
        {
          statement: `${s.overdueReviewCount} reviews overdue, ${s.dueReviewCount} due in total.`,
          observations: s.overdueReviewCount,
        },
      ],
      confidence: "high",
      action: { label: "Adjust plan", route: `/teach/learners/${s.learnerId}` },
      urgency: s.overdueReviewCount,
    },
  ];
}

function inactivity(s: LearnerSnapshot, now: EpochMs): AttentionRow[] {
  if (s.lastActiveAt === null) {
    // A learner with no recorded activity is reported as exactly that.
    return [
      {
        category: "inactivity",
        learnerId: s.learnerId,
        learnerName: s.displayName,
        headline: "No practice has ever been recorded.",
        evidence: [{ statement: "No recorded activity.", observations: 0 }],
        confidence: "high",
        action: { label: "Open profile", route: `/teach/learners/${s.learnerId}` },
        urgency: 1000,
      },
    ];
  }
  const quiet = days(s.lastActiveAt, now);
  if (quiet < attentionParams.inactivityDays) return [];
  return [
    {
      category: "inactivity",
      learnerId: s.learnerId,
      learnerName: s.displayName,
      headline: `Quiet for ${Math.floor(quiet)} days.`,
      evidence: [
        {
          statement: `Last recorded practice ${Math.floor(quiet)} days ago.`,
          observations: 1,
        },
      ],
      confidence: "high",
      action: { label: "Open profile", route: `/teach/learners/${s.learnerId}` },
      urgency: quiet,
    },
  ];
}

function governance(s: LearnerSnapshot, now: EpochMs): AttentionRow[] {
  if (s.governanceRequests.length === 0) return [];
  const oldest = [...s.governanceRequests].sort(
    (a, b) => a.requestedAt - b.requestedAt,
  )[0]!;
  const labels: Record<GovernanceRequest["kind"], string> = {
    guardian_claim: "A guardian has claimed a relationship with this learner.",
    tutoring_grant: "A tutoring grant is awaiting a decision.",
    data_export: "A data export has been requested.",
    deletion: "A deletion request is awaiting a decision.",
  };
  return [
    {
      category: "governance_request",
      learnerId: s.learnerId,
      learnerName: s.displayName,
      headline: labels[oldest.kind],
      evidence: [
        {
          statement: `Waiting ${round1(days(oldest.requestedAt, now))} days.`,
          observations: s.governanceRequests.length,
        },
      ],
      confidence: "high",
      action: { label: "Review request", route: "/admin/governance" },
      urgency: days(oldest.requestedAt, now),
    },
  ];
}

/**
 * Recently improved.
 *
 * Last in the order on purpose: good news is worth surfacing, but never
 * above work that is waiting.
 */
function recentlyImproved(s: LearnerSnapshot): AttentionRow[] {
  const sorted = [...s.delayedRecalls].sort((a, b) => b.occurredAt - a.occurredAt);
  const streak = sorted.findIndex((r) => !r.correct);
  const cleanRun = streak === -1 ? sorted.length : streak;
  if (cleanRun < attentionParams.improvementStreak) return [];
  return [
    {
      category: "recently_improved",
      learnerId: s.learnerId,
      learnerName: s.displayName,
      headline: `${cleanRun} clean delayed recalls in a row.`,
      evidence: [
        {
          statement: `${cleanRun} of the last ${sorted.length} delayed recalls succeeded.`,
          observations: cleanRun,
        },
      ],
      confidence: "high",
      action: { label: "Open profile", route: `/teach/learners/${s.learnerId}` },
      urgency: cleanRun,
    },
  ];
}

const BUILDERS: Record<
  AttentionCategory,
  (s: LearnerSnapshot, now: EpochMs) => AttentionRow[]
> = {
  awaiting_verification: awaitingVerification,
  repeated_corrections: (s) => repeatedCorrections(s),
  recall_decline: (s) => recallDecline(s),
  not_started: notStarted,
  review_overload: (s) => reviewOverload(s),
  inactivity: inactivity,
  governance_request: governance,
  recently_improved: (s) => recentlyImproved(s),
};

export interface AttentionInbox {
  rows: readonly AttentionRow[];
  /** Counts per category, so the teacher sees shape before detail. */
  counts: Readonly<Record<AttentionCategory, number>>;
  /** Stated whenever the inbox was truncated. Never silently cut. */
  cappedNotice?: string;
  version: string;
}

export interface AttentionOptions {
  now: EpochMs;
  /** Rows to show. Excess is reported, never hidden. */
  maxRows?: number;
}

/**
 * Build the ordered inbox for one teacher's learners.
 *
 * Ordering is category-first (the fixed order above), then urgency, then
 * learner id — so the same inputs always produce the same inbox.
 */
export function buildAttentionInbox(
  learners: readonly LearnerSnapshot[],
  opts: AttentionOptions,
): AttentionInbox {
  const all: AttentionRow[] = [];
  for (const s of learners)
    for (const category of ATTENTION_ORDER)
      all.push(...BUILDERS[category](s, opts.now));

  const categoryRank = new Map<AttentionCategory, number>(
    ATTENTION_ORDER.map((c, i) => [c, i]),
  );
  all.sort(
    (a, b) =>
      categoryRank.get(a.category)! - categoryRank.get(b.category)! ||
      b.urgency - a.urgency ||
      a.learnerId.localeCompare(b.learnerId),
  );

  const counts = Object.fromEntries(
    ATTENTION_ORDER.map((c) => [c, all.filter((r) => r.category === c).length]),
  ) as Record<AttentionCategory, number>;

  const maxRows = opts.maxRows ?? Number.POSITIVE_INFINITY;
  const rows = all.slice(0, maxRows);
  const hidden = all.length - rows.length;

  const inbox: AttentionInbox = { rows, counts, version: ATTENTION_VERSION };
  if (hidden > 0)
    inbox.cappedNotice = `${hidden} further ${hidden === 1 ? "item" : "items"} need attention but are not shown. Nothing has been dismissed.`;
  return inbox;
}
