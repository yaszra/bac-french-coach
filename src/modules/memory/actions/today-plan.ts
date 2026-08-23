/**
 * Today's plan.
 *
 * This is the join between the two pure engines and the learner's actual data:
 * it reads a snapshot, hands the memory engine's policy everything it needs, then
 * hands the ranked result to the ḥifẓ session planner to be cut down to what fits
 * the tier's minutes.
 *
 * What it does NOT do is decide anything. Both engines are pure; this function
 * supplies `now`, the states, the candidates and the tier, and carries the
 * machine-readable reasons back out untouched. It never writes memory state, and
 * an empty plan is returned as an empty plan — with the engine's own reason key —
 * rather than being padded with invented work.
 */

import { planSession as rankSession, DEFAULT_TIER_POLICIES } from "../domain/policy";
import type {
  MaintenanceCandidate,
  NewUnitCandidate,
  RecentLapse,
  SessionLoad,
  VerificationRequest as PolicyVerificationRequest,
} from "../domain/policy";
import type { LearnerTier, MemoryState, UnitId } from "../domain/types";
import { planSession as fitSession, type HifzSessionPlan } from "@/modules/hifz/domain/sessionPlan";
import { learnerSnapshot, type LearnerSnapshot } from "@/modules/hifz/repo/learner-repo";
import { parseHifzScope } from "@/modules/hifz/ui/passage";
import {
  counted,
  goalStateOf,
  headlineOf,
  streakOf,
  streamCounts,
  type Counted,
  type GoalState,
  type StreakConfig,
  type Streak,
  type StreamCounts,
} from "@/modules/hifz/ui/plan-shape";

/** Days after which a maintenance read is offered. Mirrors the tier policy. */
function maintenanceIntervalFor(tier: LearnerTier): number {
  return DEFAULT_TIER_POLICIES[tier].maintenanceIntervalDays;
}

export interface TodayPlan {
  readonly now: Date;
  readonly learnerUserId: string;
  readonly tier: LearnerTier;
  readonly displayName: string;
  /** The reciter this learner actually listens to. Never a default we picked. */
  readonly reciterId: string;
  /** The plan as the ḥifẓ planner cut it — the one first action lives here. */
  readonly plan: HifzSessionPlan;
  /** The policy's session load, so the "why" of a withheld new āyah survives. */
  readonly load: SessionLoad;
  /** Due units, with the total number of recorded units as its denominator. */
  readonly due: Counted;
  readonly goal: GoalState;
  readonly streak: Streak;
  readonly streams: StreamCounts;
  /** Verification requests waiting on a person. Never presented as a pass. */
  readonly awaitingTeacher: number;
  /** True when the learner has no assignment at all — "ask a grown-up". */
  readonly hasAssignment: boolean;
  /** True when there is recorded material old enough to be worth re-reading. */
  readonly canReadForMaintenance: boolean;
  readonly states: readonly MemoryState[];
}

export interface TodayPlanOptions {
  readonly now?: Date;
  readonly streak?: StreakConfig;
  /** Override the tier's budget. Ceilings still apply — kids never exceed ten minutes. */
  readonly budgetMinutes?: number;
}

/**
 * Build the plan for one learner.
 *
 * `learnerUserId` and `organizationId` are supplied by the caller, which has
 * already resolved and authorised the caller. This module does no authorisation
 * of its own precisely so that it cannot be the place someone forgets to.
 */
export async function getTodayPlan(
  organizationId: string,
  learnerUserId: string,
  options: TodayPlanOptions = {},
): Promise<TodayPlan> {
  const now = options.now ?? new Date();
  const snapshot = await learnerSnapshot(organizationId, learnerUserId, now);
  return shapeTodayPlan(snapshot, learnerUserId, options);
}

/**
 * The pure half: a snapshot in, a plan out.
 *
 * Split out so the shaping can be exercised without a database — and so that the
 * decision-making stays visibly free of I/O.
 */
export function shapeTodayPlan(
  snapshot: LearnerSnapshot,
  learnerUserId: string,
  options: TodayPlanOptions = {},
): TodayPlan {
  const now = snapshot.now;
  const tier: LearnerTier = snapshot.profile?.tier ?? "adult";
  const tierPolicy = DEFAULT_TIER_POLICIES[tier];
  const states: readonly MemoryState[] = snapshot.states;
  const byUnit = new Map<UnitId, MemoryState>(states.map((state) => [state.unitId, state]));

  // Failures the learner has actually had. The engine never infers a lapse: it
  // is a recorded `again`, or it does not exist.
  const recentLapses: readonly RecentLapse[] = snapshot.recentAttempts
    .filter((attempt) => attempt.grade === "again")
    .map((attempt) => ({ unitId: attempt.unitId, occurredAt: attempt.occurredAt }));

  // New material comes only from what a teacher assigned. Nothing self-assigns.
  const newCandidates: readonly NewUnitCandidate[] = snapshot.scopeUnits
    .filter((unit) => {
      const state = byUnit.get(unit.unitId);
      return state === undefined || state.reps === 0;
    })
    .map((unit) => ({ unitId: unit.unitId, kind: unit.kind, order: unit.order }));

  const maintenance: readonly MaintenanceCandidate[] = states
    .filter((state) => state.kind === "ayah_body" && state.reps > 0)
    .map((state) => ({
      unitId: state.unitId,
      kind: state.kind,
      lastReadAt: state.lastReviewAt,
    }));

  const verificationRequests: readonly PolicyVerificationRequest[] = snapshot.pendingVerifications
    .flatMap((request) => {
      const scope = parseHifzScope(request.unitScope);
      if (scope === null) return [];
      return [{ unitId: `b:${scope.sura}:${scope.ayahFrom}`, requestedAt: request.requestedAt }];
    });

  const ranked = rankSession({
    now,
    tier,
    states,
    recentLapses,
    newCandidates,
    maintenance,
    verificationRequests,
  });

  const plan = fitSession({
    recommendations: ranked.recommendations,
    tierBudgetMinutes: options.budgetMinutes ?? tierPolicy.sessionBudgetMinutes,
    maxNewUnits: tierPolicy.maxNewUnitsPerSession,
    tier,
    states,
    now,
  });

  const practisedDays = snapshot.recentAttempts.map((attempt) => attempt.occurredAt);
  const streak = streakOf(practisedDays, now, options.streak);

  const todayStart = new Date(now.getTime());
  todayStart.setUTCHours(0, 0, 0, 0);
  const doneToday = new Set(
    snapshot.recentAttempts
      .filter((attempt) => attempt.occurredAt >= todayStart)
      .map((attempt) => attempt.unitId),
  ).size;

  const streams = streamCounts(
    plan.kind === "plan"
      ? plan.steps.map((step) => ({
          unitId: step.unitId,
          action: step.action,
          stabilityDays: byUnit.get(step.unitId)?.stability ?? null,
        }))
      : [],
  );

  const maintenanceCutoff = now.getTime() - maintenanceIntervalFor(tier) * 86_400_000;
  const canReadForMaintenance = maintenance.some(
    (candidate) => candidate.lastReadAt === null || candidate.lastReadAt.getTime() <= maintenanceCutoff,
  );

  return {
    now,
    learnerUserId,
    tier,
    displayName: snapshot.profile?.displayName ?? "",
    reciterId: snapshot.profile?.reciterId ?? "husary",
    plan,
    load: ranked.load,
    due: counted(doneToday, snapshot.dueUnitIds.length + doneToday),
    goal: goalStateOf(snapshot.profile?.dailyGoalUnits ?? 0, doneToday),
    streak,
    streams,
    awaitingTeacher: snapshot.pendingVerifications.length,
    hasAssignment: snapshot.scopeUnits.length > 0,
    canReadForMaintenance,
    states,
  };
}

/** The headline the learner sees, computed from a plan. Re-exported for the UI. */
export function todayHeadline(plan: TodayPlan) {
  return headlineOf(plan.plan, { canReadForMaintenance: plan.canReadForMaintenance });
}
