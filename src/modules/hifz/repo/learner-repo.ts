/**
 * What the learner's own screens read.
 *
 * Every function here is a READ, and every read goes through `withTenant`, so
 * isolation is the database's job rather than a `where` clause someone has to
 * remember. Nothing in this file writes memory state, mastery or a grade —
 * memory state is a projection of the append-only event log, and the only path
 * into it is the attempt/verdict pipeline.
 *
 * `learnerSnapshot` is the important one: Today needs the profile, the
 * assignments, the memory states, the recent history and the pending
 * verifications, and it needs them from ONE consistent point in time. Five
 * separate round trips could disagree with each other, and a learner would see a
 * due count that does not match the list under it.
 */

import { withTenant, type TenantClient } from "../../platform/db/tenant";
import type { MemoryState, UnitId, UnitKind } from "../../memory/domain/types";
import type { LearnerTier } from "../../memory/domain/types";
import { parseHifzScope, unitsOfScopes, type HifzScope, type ScopeUnit } from "../ui/passage";

/* --------------------------------------------------------------- the shapes */

export interface LearnerProfileRow {
  readonly learnerUserId: string;
  readonly displayName: string;
  readonly tier: LearnerTier;
  readonly locale: "en" | "ar";
  readonly reciterId: string;
  readonly dailyGoalUnits: number;
  readonly timezone: string;
}

export interface LearnerAssignment {
  readonly assignmentId: string;
  readonly track: string;
  readonly scope: HifzScope | null;
  readonly dueAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
}

export interface StoredMemoryState extends MemoryState {
  readonly dueAt: Date | null;
  readonly verifiedAt: Date | null;
}

export interface RecentAttempt {
  readonly unitId: UnitId;
  readonly retrievalType: string;
  readonly grade: string;
  readonly occurredAt: Date;
}

export interface PendingVerification {
  readonly id: string;
  readonly unitScope: unknown;
  readonly track: string;
  readonly requestedAt: Date;
  readonly state: string;
}

export interface LearnerSnapshot {
  readonly now: Date;
  readonly profile: LearnerProfileRow | null;
  readonly assignments: readonly LearnerAssignment[];
  /** Units the assignments cover, in curriculum order. References only. */
  readonly scopeUnits: readonly ScopeUnit[];
  readonly states: readonly StoredMemoryState[];
  /** Attempts inside the history window, newest first. */
  readonly recentAttempts: readonly RecentAttempt[];
  readonly pendingVerifications: readonly PendingVerification[];
  /** Units due on or before `now`, from the same read as everything else. */
  readonly dueUnitIds: readonly UnitId[];
  /** Total units with any row at all — the denominator for "x of y". */
  readonly recordedUnitCount: number;
}

/** How far back the snapshot looks for attempts. Enough for a streak and a lapse. */
export const HISTORY_WINDOW_DAYS = 60;

/* ---------------------------------------------------------------- mapping */

type MemoryStateRow = {
  unitId: string;
  unitKind: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewAt: Date | null;
  lastRetrievalType: string | null;
  confidence: number;
  dueAt: Date | null;
  verifiedAt: Date | null;
};

function toState(row: MemoryStateRow): StoredMemoryState {
  return {
    unitId: row.unitId as UnitId,
    kind: row.unitKind as UnitKind,
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    lastReviewAt: row.lastReviewAt,
    lastRetrievalType: row.lastRetrievalType as MemoryState["lastRetrievalType"],
    confidence: row.confidence,
    dueAt: row.dueAt,
    verifiedAt: row.verifiedAt,
  };
}

function toTier(value: string): LearnerTier {
  return value === "kids" || value === "teen" ? value : "adult";
}

/* ------------------------------------------------------------------- reads */

export async function getProfile(
  organizationId: string,
  learnerUserId: string,
  tx?: TenantClient,
): Promise<LearnerProfileRow | null> {
  const read = async (client: TenantClient): Promise<LearnerProfileRow | null> => {
    const row = await client.learnerProfile.findUnique({
      where: { userId: learnerUserId },
      select: {
        userId: true,
        tier: true,
        reciterId: true,
        dailyGoalUnits: true,
        timezone: true,
        user: { select: { displayName: true, locale: true } },
      },
    });
    if (row === null) return null;
    return {
      learnerUserId: row.userId,
      displayName: row.user.displayName,
      tier: toTier(row.tier),
      locale: row.user.locale === "ar" ? "ar" : "en",
      reciterId: row.reciterId,
      dailyGoalUnits: row.dailyGoalUnits,
      timezone: row.timezone,
    };
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

/** The learner's live assignments, newest first. Archived work is not today's work. */
export async function getAssignments(
  organizationId: string,
  learnerUserId: string,
  tx?: TenantClient,
): Promise<readonly LearnerAssignment[]> {
  const read = async (client: TenantClient): Promise<readonly LearnerAssignment[]> => {
    const rows = await client.assignmentTarget.findMany({
      where: { learnerUserId, assignment: { archivedAt: null } },
      select: {
        completedAt: true,
        assignment: {
          select: { id: true, track: true, scope: true, dueAt: true, createdAt: true },
        },
      },
      orderBy: { assignment: { createdAt: "desc" } },
      take: 50,
    });
    return rows.map((row) => ({
      assignmentId: row.assignment.id,
      track: row.assignment.track,
      scope: parseHifzScope(row.assignment.scope),
      dueAt: row.assignment.dueAt,
      completedAt: row.completedAt,
      createdAt: row.assignment.createdAt,
    }));
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

/**
 * Everything due on or before `at`, weakest first.
 *
 * This is a read of the projection, not a recomputation: the schedule was
 * decided when the evidence was applied, and reading it back cannot change it.
 */
export async function getDueUnits(
  organizationId: string,
  learnerUserId: string,
  at: Date,
  limit = 200,
  tx?: TenantClient,
): Promise<readonly StoredMemoryState[]> {
  const read = async (client: TenantClient) => {
    const rows = await client.memoryState.findMany({
      where: { learnerUserId, dueAt: { not: null, lte: at } },
      orderBy: { dueAt: "asc" },
      take: limit,
    });
    return rows.map(toState);
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

export async function getAllStates(
  organizationId: string,
  learnerUserId: string,
  limit = 2000,
  tx?: TenantClient,
): Promise<readonly StoredMemoryState[]> {
  const read = async (client: TenantClient) => {
    const rows = await client.memoryState.findMany({
      where: { learnerUserId },
      orderBy: { unitId: "asc" },
      take: limit,
    });
    return rows.map(toState);
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

/** Recent attempts, newest first — the raw material for streaks and repairs. */
export async function getRecentAttempts(
  organizationId: string,
  learnerUserId: string,
  since: Date,
  limit = 500,
  tx?: TenantClient,
): Promise<readonly RecentAttempt[]> {
  const read = async (client: TenantClient) => {
    const rows = await client.attempt.findMany({
      where: { learnerUserId, occurredAt: { gte: since } },
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: { unitId: true, retrievalType: true, grade: true, occurredAt: true },
    });
    return rows.map((row) => ({
      unitId: row.unitId as UnitId,
      retrievalType: row.retrievalType,
      grade: row.grade,
      occurredAt: row.occurredAt,
    }));
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

/**
 * Verification requests still waiting on a person.
 *
 * A learner sees these as "your teacher will listen" — never as a pass. Only a
 * verdict decides that, and a verdict is a different row entirely.
 */
export async function getPendingVerifications(
  organizationId: string,
  learnerUserId: string,
  tx?: TenantClient,
): Promise<readonly PendingVerification[]> {
  const read = async (client: TenantClient) => {
    const rows = await client.verificationRequest.findMany({
      where: { learnerUserId, state: "pending" },
      orderBy: { requestedAt: "asc" },
      take: 50,
      select: { id: true, unitScope: true, track: true, requestedAt: true, state: true },
    });
    return rows.map((row) => ({
      id: row.id,
      unitScope: row.unitScope,
      track: row.track,
      requestedAt: row.requestedAt,
      state: row.state,
    }));
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

/* ---------------------------------------------------------------- snapshot */

/**
 * Everything Today needs, from one transaction and one moment.
 *
 * A learner with no profile is a real answer (`profile: null`) and the caller
 * renders it honestly — it is what a brand-new account looks like, and inventing
 * a default profile here would be inventing a tier.
 */
export async function learnerSnapshot(
  organizationId: string,
  learnerUserId: string,
  now: Date,
): Promise<LearnerSnapshot> {
  const since = new Date(now.getTime() - HISTORY_WINDOW_DAYS * 86_400_000);

  return withTenant(organizationId, async (tx) => {
    const [profile, assignments, states, recentAttempts, pendingVerifications] = await Promise.all([
      getProfile(organizationId, learnerUserId, tx),
      getAssignments(organizationId, learnerUserId, tx),
      getAllStates(organizationId, learnerUserId, 2000, tx),
      getRecentAttempts(organizationId, learnerUserId, since, 500, tx),
      getPendingVerifications(organizationId, learnerUserId, tx),
    ]);

    const scopes = assignments
      .filter((assignment) => assignment.track === "hifz" && assignment.completedAt === null)
      .map((assignment) => assignment.scope)
      .filter((scope): scope is HifzScope => scope !== null);

    const dueUnitIds = states
      .filter((state) => state.dueAt !== null && state.dueAt.getTime() <= now.getTime())
      .sort((left, right) => (left.dueAt?.getTime() ?? 0) - (right.dueAt?.getTime() ?? 0))
      .map((state) => state.unitId);

    return {
      now,
      profile,
      assignments,
      scopeUnits: unitsOfScopes(scopes),
      states,
      recentAttempts,
      pendingVerifications,
      dueUnitIds,
      recordedUnitCount: states.length,
    };
  });
}
