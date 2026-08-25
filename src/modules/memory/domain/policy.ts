/**
 * Next-best-action policy.
 *
 * One learner, one moment, one ranked list of what to do — and, for every item, a
 * machine-readable `reason` the teacher triage inbox can render as "why this?".
 *
 * Precedence (highest band first; a unit only ever appears once, in its highest band):
 *
 *   a. `verify_with_teacher`  — human verification requests that are overdue.
 *                               A person's ear outranks any model.
 *   b. `repair_drill`         — units that failed recently: repair before anything new.
 *   c. `review`               — due reviews, lowest retrievability first.
 *   d. `strengthen_join`      — transitions weaker than the āyāt they join. The join
 *                               is the part that breaks, so it gets its own band.
 *   e. `learn_new`            — new material, only while today's due load sits under
 *                               the tier's budget.
 *   f. `maintenance_reading`  — khatma / maintenance passes.
 *
 * Priorities are `band + urgency` with `urgency ∈ [0, 100)`, so bands can never
 * interleave however urgent an item is.
 *
 * Pure: no clock, no I/O. `now` and every candidate list are supplied by the caller
 * (the repo layer projects them from append-only `LearningEvent`s). Nothing here
 * writes memory state or decides mastery.
 */

import { DEFAULT_SCHEDULING_POLICY, daysOverdue, isDue, retrievability } from "./fsrs";
import { stateMapOf } from "./graph";
import { clamp, roundTo } from "./numeric";
import { daysBetween } from "./time";
import {
  bodiesOfTransition,
  hasEvidence,
  reason,
  type LearnerTier,
  type MemoryState,
  type Reason,
  type RetrievalType,
  type SchedulingPolicy,
  type UnitId,
  type UnitKind,
} from "./types";

export const RECOMMENDED_ACTIONS = [
  "verify_with_teacher",
  "repair_drill",
  "review",
  "strengthen_join",
  "learn_new",
  "maintenance_reading",
] as const;

export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

/** Precedence bands. Urgency inside a band is confined to [0, 100). */
export const ACTION_BAND: Readonly<Record<RecommendedAction, number>> = {
  verify_with_teacher: 600,
  repair_drill: 500,
  review: 400,
  strengthen_join: 300,
  learn_new: 200,
  maintenance_reading: 100,
};

/** The exercise each action runs. Verification is always the teacher's ear. */
export const DEFAULT_ACTION_RETRIEVAL: Readonly<Record<RecommendedAction, RetrievalType>> = {
  verify_with_teacher: "oral_recitation",
  repair_drill: "rebuild",
  review: "recall_first",
  strengthen_join: "connect_chain",
  learn_new: "listen",
  maintenance_reading: "oral_recitation",
};

export interface Recommendation {
  readonly action: RecommendedAction;
  readonly unitId: UnitId;
  /** i18n key + params — never literal text. */
  readonly reason: Reason;
  /** `band + urgency`; higher is more urgent. */
  readonly priority: number;
  readonly estimatedMinutes: number;
  readonly retrievalType: RetrievalType;
}

export interface TierPolicy {
  readonly sessionBudgetMinutes: number;
  readonly maxNewUnitsPerSession: number;
  /** New material is withheld once due load reaches this share of the budget. */
  readonly newMaterialLoadRatio: number;
  /** A failure this recent still counts as needing repair. */
  readonly repairWindowDays: number;
  /**
   * Retrievability gap below the joined bodies that marks a weak join. A transition
   * that is not yet due always sits above the target retention (0.90), so the margin
   * must stay below 1 − targetRetention or no join could ever qualify.
   */
  readonly weakJoinMargin: number;
  /** Days after a verification request before it counts as overdue. */
  readonly verificationGraceDays: number;
  /** Days before a passage is offered for a maintenance reading. */
  readonly maintenanceIntervalDays: number;
  readonly actionMinutes: Readonly<Record<RecommendedAction, number>>;
}

const KIDS_ACTION_MINUTES: Readonly<Record<RecommendedAction, number>> = {
  verify_with_teacher: 3,
  repair_drill: 2,
  review: 0.75,
  strengthen_join: 1,
  learn_new: 3,
  maintenance_reading: 4,
};

const OLDER_ACTION_MINUTES: Readonly<Record<RecommendedAction, number>> = {
  verify_with_teacher: 3,
  repair_drill: 2,
  review: 1,
  strengthen_join: 1.5,
  learn_new: 4,
  maintenance_reading: 6,
};

/**
 * Tier budgets. Kids (4–8) get a short, guided session and at most two new units a
 * day; adults carry more load. Ratios say how full the day must be before new
 * material is withheld — the youngest learners are protected most.
 */
export const DEFAULT_TIER_POLICIES: Readonly<Record<LearnerTier, TierPolicy>> = {
  kids: {
    sessionBudgetMinutes: 10,
    maxNewUnitsPerSession: 2,
    newMaterialLoadRatio: 0.5,
    repairWindowDays: 3,
    weakJoinMargin: 0.04,
    verificationGraceDays: 1,
    maintenanceIntervalDays: 14,
    actionMinutes: KIDS_ACTION_MINUTES,
  },
  teen: {
    sessionBudgetMinutes: 20,
    maxNewUnitsPerSession: 5,
    newMaterialLoadRatio: 0.7,
    repairWindowDays: 5,
    weakJoinMargin: 0.05,
    verificationGraceDays: 2,
    maintenanceIntervalDays: 21,
    actionMinutes: OLDER_ACTION_MINUTES,
  },
  adult: {
    sessionBudgetMinutes: 30,
    maxNewUnitsPerSession: 8,
    newMaterialLoadRatio: 0.8,
    repairWindowDays: 7,
    weakJoinMargin: 0.05,
    verificationGraceDays: 3,
    maintenanceIntervalDays: 30,
    actionMinutes: OLDER_ACTION_MINUTES,
  },
};

export interface VerificationRequest {
  readonly unitId: UnitId;
  readonly requestedAt: Date;
  /** When the request becomes overdue. Defaults to `requestedAt + grace` when absent. */
  readonly dueAt?: Date;
}

export interface RecentLapse {
  readonly unitId: UnitId;
  readonly occurredAt: Date;
}

export interface NewUnitCandidate {
  readonly unitId: UnitId;
  readonly kind: UnitKind;
  /** Curriculum order; lower comes first. */
  readonly order: number;
}

export interface MaintenanceCandidate {
  readonly unitId: UnitId;
  readonly kind: UnitKind;
  readonly lastReadAt: Date | null;
}

export interface PolicyInput {
  readonly now: Date;
  readonly tier: LearnerTier;
  readonly states: readonly MemoryState[];
  readonly verificationRequests?: readonly VerificationRequest[];
  /** Failures projected from the event log; the engine never infers them silently. */
  readonly recentLapses?: readonly RecentLapse[];
  readonly newCandidates?: readonly NewUnitCandidate[];
  readonly maintenance?: readonly MaintenanceCandidate[];
  readonly tierPolicy?: TierPolicy;
  readonly scheduling?: SchedulingPolicy;
}

export interface SessionLoad {
  readonly verificationCount: number;
  readonly repairCount: number;
  readonly dueReviewCount: number;
  readonly weakJoinCount: number;
  /** Estimated minutes of work that must happen before any new material. */
  readonly dueLoadMinutes: number;
  readonly budgetMinutes: number;
  /** Load above which new material is withheld. */
  readonly newMaterialBudgetMinutes: number;
  readonly newWithheld: boolean;
  /** Why new material was withheld, or `null` when it was not. */
  readonly newWithheldReason: Reason | null;
  readonly newUnitsProposed: number;
}

export interface SessionPlan {
  /** Everything worth doing, ranked. */
  readonly recommendations: readonly Recommendation[];
  /** The prefix that fits the tier's session budget. */
  readonly selected: readonly Recommendation[];
  readonly load: SessionLoad;
}

/** Keep urgency strictly inside its band. */
function urgency(value: number): number {
  return clamp(value, 0, 99.999);
}

function tierPolicyOf(input: PolicyInput): TierPolicy {
  return input.tierPolicy ?? DEFAULT_TIER_POLICIES[input.tier];
}

function build(
  action: RecommendedAction,
  unitId: UnitId,
  reasonValue: Reason,
  urgencyValue: number,
  tier: TierPolicy,
): Recommendation {
  return {
    action,
    unitId,
    reason: reasonValue,
    priority: ACTION_BAND[action] + urgency(urgencyValue),
    estimatedMinutes: tier.actionMinutes[action],
    retrievalType: DEFAULT_ACTION_RETRIEVAL[action],
  };
}

/**
 * Rank the whole board and report the session load.
 *
 * Each unit appears at most once: the highest band wins, so a lapsed unit that is
 * also due shows up as a repair drill, not twice.
 */
export function planSession(input: PolicyInput): SessionPlan {
  const tier = tierPolicyOf(input);
  const scheduling = input.scheduling ?? DEFAULT_SCHEDULING_POLICY;
  const now = input.now;
  const states = stateMapOf(input.states);
  const claimed = new Set<UnitId>();
  const recommendations: Recommendation[] = [];

  // (a) overdue human verification — the teacher's ear outranks the model.
  let verificationCount = 0;
  for (const request of input.verificationRequests ?? []) {
    const dueAtValue =
      request.dueAt ??
      new Date(request.requestedAt.getTime() + tier.verificationGraceDays * 86_400_000);
    const overdueDays = daysBetween(dueAtValue, now);
    if (overdueDays < 0) continue;
    if (claimed.has(request.unitId)) continue;
    claimed.add(request.unitId);
    verificationCount += 1;
    recommendations.push(
      build(
        "verify_with_teacher",
        request.unitId,
        reason("memory.reason.verification_overdue", {
          unitId: request.unitId,
          overdueDays: Math.floor(overdueDays),
        }),
        overdueDays * 10,
        tier,
      ),
    );
  }

  // (b) recent failures — repair before anything new is added on top.
  let repairCount = 0;
  for (const lapse of input.recentLapses ?? []) {
    if (claimed.has(lapse.unitId)) continue;
    const sinceDays = daysBetween(lapse.occurredAt, now);
    if (sinceDays < 0 || sinceDays > tier.repairWindowDays) continue;
    claimed.add(lapse.unitId);
    repairCount += 1;
    const state = states.get(lapse.unitId);
    const recall = state === undefined ? 0 : retrievability(state, now, scheduling);
    recommendations.push(
      build(
        "repair_drill",
        lapse.unitId,
        reason("memory.reason.recent_lapse", {
          unitId: lapse.unitId,
          daysSinceLapse: Math.floor(sinceDays),
          lapses: state?.lapses ?? 1,
        }),
        // Freshest failure first, then weakest recall.
        90 * (1 - sinceDays / Math.max(tier.repairWindowDays, 1)) + 9 * (1 - recall),
        tier,
      ),
    );
  }

  // (c) due reviews — lowest retrievability first.
  let dueReviewCount = 0;
  for (const state of input.states) {
    if (claimed.has(state.unitId)) continue;
    if (!hasEvidence(state)) continue;
    if (!isDue(state, now, scheduling)) continue;
    claimed.add(state.unitId);
    dueReviewCount += 1;
    const recall = retrievability(state, now, scheduling);
    const overdue = daysOverdue(state, now, scheduling);
    recommendations.push(
      build(
        "review",
        state.unitId,
        reason("memory.reason.due_review", {
          unitId: state.unitId,
          retrievability: roundTo(recall, 2),
          overdueDays: Math.floor(overdue),
        }),
        99 * (1 - recall),
        tier,
      ),
    );
  }

  // (d) weak joins — the seam is weaker than both āyāt it joins. A join that is
  // already due was claimed by the review band above; what is left here are joins
  // that look fine on the schedule but are quietly lagging their own āyāt.
  let weakJoinCount = 0;
  for (const state of input.states) {
    if (claimed.has(state.unitId)) continue;
    if (state.kind !== "ayah_transition" || !hasEvidence(state)) continue;
    const bodies = bodiesOfTransition(state.unitId);
    if (bodies === null) continue;
    const bodyStates = bodies.map((id) => states.get(id));
    if (bodyStates.some((body) => body === undefined || !hasEvidence(body))) continue;
    const bodyRecall = Math.min(
      ...bodyStates.map((body) => (body === undefined ? 0 : retrievability(body, now, scheduling))),
    );
    const joinRecall = retrievability(state, now, scheduling);
    const gap = bodyRecall - joinRecall;
    if (gap <= tier.weakJoinMargin) continue;
    claimed.add(state.unitId);
    weakJoinCount += 1;
    recommendations.push(
      build(
        "strengthen_join",
        state.unitId,
        reason("memory.reason.weak_join", {
          unitId: state.unitId,
          joinRetrievability: roundTo(joinRecall, 2),
          bodyRetrievability: roundTo(bodyRecall, 2),
          gap: roundTo(gap, 2),
        }),
        99 * gap,
        tier,
      ),
    );
  }

  const dueLoadMinutes = recommendations.reduce((total, item) => total + item.estimatedMinutes, 0);
  const newMaterialBudgetMinutes = tier.sessionBudgetMinutes * tier.newMaterialLoadRatio;

  // (e) new material — only while the day still has room.
  const newCandidates = [...(input.newCandidates ?? [])]
    .filter((candidate) => !claimed.has(candidate.unitId))
    .filter((candidate) => {
      const state = states.get(candidate.unitId);
      return state === undefined || !hasEvidence(state);
    })
    .sort((left, right) => left.order - right.order || (left.unitId < right.unitId ? -1 : 1));

  let newWithheldReason: Reason | null = null;
  if (dueLoadMinutes >= newMaterialBudgetMinutes && newCandidates.length > 0) {
    newWithheldReason = reason("memory.reason.new_material_withheld_load", {
      dueLoadMinutes: roundTo(dueLoadMinutes, 1),
      newMaterialBudgetMinutes: roundTo(newMaterialBudgetMinutes, 1),
      dueReviewCount,
      repairCount,
    });
  } else if (tier.maxNewUnitsPerSession <= 0 && newCandidates.length > 0) {
    newWithheldReason = reason("memory.reason.new_material_withheld_tier", {
      maxNewUnitsPerSession: tier.maxNewUnitsPerSession,
    });
  }

  let newUnitsProposed = 0;
  if (newWithheldReason === null) {
    let projected = dueLoadMinutes;
    for (const [rank, candidate] of newCandidates.entries()) {
      if (newUnitsProposed >= tier.maxNewUnitsPerSession) break;
      const cost = tier.actionMinutes.learn_new;
      if (projected + cost > tier.sessionBudgetMinutes) break;
      projected += cost;
      newUnitsProposed += 1;
      claimed.add(candidate.unitId);
      recommendations.push(
        build(
          "learn_new",
          candidate.unitId,
          reason("memory.reason.new_material", {
            unitId: candidate.unitId,
            order: candidate.order,
            dueLoadMinutes: roundTo(dueLoadMinutes, 1),
            budgetMinutes: tier.sessionBudgetMinutes,
          }),
          99 - rank,
          tier,
        ),
      );
    }
  }

  // (f) maintenance / khatma reading.
  for (const candidate of input.maintenance ?? []) {
    if (claimed.has(candidate.unitId)) continue;
    const sinceDays =
      candidate.lastReadAt === null
        ? Number.POSITIVE_INFINITY
        : daysBetween(candidate.lastReadAt, now);
    if (sinceDays < tier.maintenanceIntervalDays) continue;
    claimed.add(candidate.unitId);
    recommendations.push(
      build(
        "maintenance_reading",
        candidate.unitId,
        candidate.lastReadAt === null
          ? reason("memory.reason.maintenance_never_read", { unitId: candidate.unitId })
          : reason("memory.reason.maintenance_due", {
              unitId: candidate.unitId,
              daysSinceRead: Math.floor(sinceDays),
              maintenanceIntervalDays: tier.maintenanceIntervalDays,
            }),
        Number.isFinite(sinceDays)
          ? (sinceDays / Math.max(tier.maintenanceIntervalDays, 1)) * 10
          : 99,
        tier,
      ),
    );
  }

  recommendations.sort(
    (left, right) =>
      right.priority - left.priority ||
      (left.unitId < right.unitId ? -1 : left.unitId > right.unitId ? 1 : 0),
  );

  // One obvious next action always survives, even on an over-budget day.
  const selected: Recommendation[] = [];
  let spent = 0;
  for (const item of recommendations) {
    if (selected.length > 0 && spent + item.estimatedMinutes > tier.sessionBudgetMinutes) continue;
    selected.push(item);
    spent += item.estimatedMinutes;
  }

  return {
    recommendations,
    selected,
    load: {
      verificationCount,
      repairCount,
      dueReviewCount,
      weakJoinCount,
      dueLoadMinutes,
      budgetMinutes: tier.sessionBudgetMinutes,
      newMaterialBudgetMinutes,
      newWithheld: newWithheldReason !== null,
      newWithheldReason,
      newUnitsProposed,
    },
  };
}

/** The ranked recommendation list for this learner at this moment. */
export function recommend(input: PolicyInput): readonly Recommendation[] {
  return planSession(input).recommendations;
}
