import { withTenant, type TenantClient } from "../../platform/db/tenant";
import type { RecommendationSignal, TriageSignals } from "../domain/triage";
import type { OnboardingFacts } from "../domain/onboarding";

/**
 * Everything the teacher console reads.
 *
 * The division of labour is strict: this file reads FACTS — counts, moments,
 * ids — and the pure domain decides what they mean. There is no ranking here,
 * no thresholds, and no sentences. That is what makes the inbox testable
 * without a database and identical for every teacher looking at the same class.
 *
 * Every query runs inside `withTenant`, so row-level security, not a forgotten
 * `where` clause, is what keeps one school out of another's data.
 */

export type ClassroomSummary = {
  readonly id: string;
  readonly name: string;
  readonly joinCode: string;
  readonly learnerCount: number;
};

export type LearnerSummary = {
  readonly userId: string;
  readonly displayName: string;
  readonly tier: "kids" | "teen" | "adult";
};

/** How far back a lapse still counts towards "this keeps slipping". */
const LAPSE_WINDOW_DAYS = 14;

export async function listClassrooms(
  organizationId: string,
  teacherUserId: string,
): Promise<readonly ClassroomSummary[]> {
  return withTenant(organizationId, async (tx) => {
    const rows = await tx.classroom.findMany({
      where: { teacherUserId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        joinCode: true,
        _count: { select: { enrollments: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      joinCode: row.joinCode,
      learnerCount: row._count.enrollments,
    }));
  });
}

export async function listLearners(
  organizationId: string,
  classroomId: string,
  tx?: TenantClient,
): Promise<readonly LearnerSummary[]> {
  const read = async (client: TenantClient): Promise<readonly LearnerSummary[]> => {
    const rows = await client.enrollment.findMany({
      where: { classroomId, leftAt: null },
      select: { learnerUserId: true, learner: { select: { tier: true } } },
    });
    if (rows.length === 0) return [];
    const users = await client.user.findMany({
      where: { id: { in: rows.map((row) => row.learnerUserId) } },
      select: { id: true, displayName: true },
    });
    const names = new Map(users.map((user) => [user.id, user.displayName]));
    return rows
      .map((row) => ({
        userId: row.learnerUserId,
        displayName: names.get(row.learnerUserId) ?? row.learnerUserId,
        tier: row.learner.tier,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

/**
 * The raw signals behind the inbox, one row per learner.
 *
 * Deliberately a handful of grouped queries rather than one per learner: a
 * class of thirty must not become ninety round-trips, and a teacher opening
 * the console at 6pm should not wait on the database to think.
 */
export async function triageSignalsFor(
  organizationId: string,
  learnerUserIds: readonly string[],
  now: Date,
): Promise<readonly TriageSignals[]> {
  if (learnerUserIds.length === 0) return [];
  const ids = [...learnerUserIds];
  const lapseWindowStart = new Date(now.getTime() - LAPSE_WINDOW_DAYS * 86_400_000);

  return withTenant(organizationId, async (tx) => {
    const [pending, claims, lapses, dueRows, trackedRows, lastEvents, recommendations] =
      await Promise.all([
        tx.verificationRequest.groupBy({
          by: ["learnerUserId"],
          where: { learnerUserId: { in: ids }, state: "pending" },
          _min: { requestedAt: true },
        }),
        tx.relationship.findMany({
          where: { objectUserId: { in: ids }, kind: "guardian_child", state: "claimed", revokedAt: null },
          select: { objectUserId: true, createdAt: true },
        }),
        tx.attempt.groupBy({
          by: ["learnerUserId"],
          where: { learnerUserId: { in: ids }, grade: "again", occurredAt: { gte: lapseWindowStart } },
          _count: { _all: true },
        }),
        tx.memoryState.groupBy({
          by: ["learnerUserId"],
          where: { learnerUserId: { in: ids }, dueAt: { not: null, lte: now } },
          _count: { _all: true },
          _min: { dueAt: true },
        }),
        tx.memoryState.groupBy({
          by: ["learnerUserId"],
          where: { learnerUserId: { in: ids } },
          _count: { _all: true },
        }),
        tx.learningEvent.groupBy({
          by: ["learnerUserId"],
          where: { learnerUserId: { in: ids } },
          _max: { occurredAt: true },
        }),
        tx.learningEvent.findMany({
          where: {
            learnerUserId: { in: ids },
            type: { in: ["recommendation.acted", "recommendation.ignored"] },
          },
          orderBy: { occurredAt: "desc" },
          select: { learnerUserId: true, type: true, occurredAt: true },
        }),
      ]);

    const pendingBy = new Map(pending.map((row) => [row.learnerUserId, row._min.requestedAt]));
    const claimBy = new Map(claims.map((row) => [row.objectUserId, row.createdAt]));
    const lapsesBy = new Map(lapses.map((row) => [row.learnerUserId, row._count._all]));
    const dueBy = new Map(dueRows.map((row) => [row.learnerUserId, row]));
    const trackedBy = new Map(trackedRows.map((row) => [row.learnerUserId, row._count._all]));
    const lastBy = new Map(lastEvents.map((row) => [row.learnerUserId, row._max.occurredAt]));

    /* Only the most recent recommendation per learner matters: an inbox that
       replayed a week of nudges would be a log, not a list of what to do. */
    const recommendationBy = new Map<string, RecommendationSignal>();
    for (const row of recommendations) {
      if (recommendationBy.has(row.learnerUserId)) continue;
      recommendationBy.set(row.learnerUserId, {
        action: row.type,
        createdAt: row.occurredAt,
        actedAt: row.type === "recommendation.acted" ? row.occurredAt : null,
      });
    }

    return ids.map((learnerUserId): TriageSignals => {
      const due = dueBy.get(learnerUserId);
      return {
        learnerUserId,
        pendingVerificationSince: pendingBy.get(learnerUserId) ?? null,
        guardianClaimSince: claimBy.get(learnerUserId) ?? null,
        lapsesInWindow: lapsesBy.get(learnerUserId) ?? 0,
        overdueReviews: due?._count._all ?? 0,
        trackedUnits: trackedBy.get(learnerUserId) ?? 0,
        oldestDueAt: due?._min.dueAt ?? null,
        lastActivityAt: lastBy.get(learnerUserId) ?? null,
        recommendation: recommendationBy.get(learnerUserId) ?? null,
      };
    });
  });
}

/* ------------------------------------------------------------ one learner */

export type LearnerProfileFacts = {
  readonly userId: string;
  readonly displayName: string;
  readonly tier: "kids" | "teen" | "adult";
  readonly timezone: string;
  /** Units with any recorded state. Zero means "not yet recorded", not zero progress. */
  readonly trackedUnits: number;
  readonly verifiedUnits: number;
  readonly dueNow: number;
  readonly attempts: number;
  readonly successfulAttempts: number;
  readonly verdictsGiven: number;
  readonly verdictsPassed: number;
  readonly lastActivityAt: Date | null;
};

export async function learnerFacts(
  organizationId: string,
  learnerUserId: string,
  now: Date,
): Promise<LearnerProfileFacts | null> {
  return withTenant(organizationId, async (tx) => {
    const profile = await tx.learnerProfile.findUnique({
      where: { userId: learnerUserId },
      select: { userId: true, tier: true, timezone: true },
    });
    if (!profile) return null;
    const user = await tx.user.findUnique({
      where: { id: learnerUserId },
      select: { displayName: true },
    });

    const [tracked, verified, dueNow, attempts, successes, verdicts, lastEvent] = await Promise.all([
      tx.memoryState.count({ where: { learnerUserId } }),
      tx.memoryState.count({ where: { learnerUserId, verifiedAt: { not: null } } }),
      tx.memoryState.count({ where: { learnerUserId, dueAt: { not: null, lte: now } } }),
      tx.attempt.count({ where: { learnerUserId } }),
      tx.attempt.count({ where: { learnerUserId, grade: { in: ["good", "easy"] } } }),
      tx.verdict.findMany({
        where: { request: { learnerUserId } },
        select: { verdict: true },
      }),
      tx.learningEvent.aggregate({
        where: { learnerUserId },
        _max: { occurredAt: true },
      }),
    ]);

    return {
      userId: profile.userId,
      displayName: user?.displayName ?? profile.userId,
      tier: profile.tier,
      timezone: profile.timezone,
      trackedUnits: tracked,
      verifiedUnits: verified,
      dueNow,
      attempts,
      successfulAttempts: successes,
      verdictsGiven: verdicts.length,
      verdictsPassed: verdicts.filter((row) => row.verdict === "passed").length,
      lastActivityAt: lastEvent._max.occurredAt,
    };
  });
}

export type AttemptRow = {
  readonly id: string;
  readonly unitId: string;
  readonly retrievalType: string;
  readonly grade: string;
  readonly occurredAt: Date;
};

export async function recentAttempts(
  organizationId: string,
  learnerUserId: string,
  limit = 25,
): Promise<readonly AttemptRow[]> {
  return withTenant(organizationId, (tx) =>
    tx.attempt.findMany({
      where: { learnerUserId },
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: { id: true, unitId: true, retrievalType: true, grade: true, occurredAt: true },
    }),
  );
}

export type AssignmentRow = {
  readonly id: string;
  readonly track: string;
  readonly scope: unknown;
  readonly settings: unknown;
  readonly dueAt: Date | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
};

export async function assignmentsFor(
  organizationId: string,
  learnerUserId: string,
  limit = 20,
): Promise<readonly AssignmentRow[]> {
  return withTenant(organizationId, async (tx) => {
    const targets = await tx.assignmentTarget.findMany({
      where: { learnerUserId },
      take: limit,
      select: {
        completedAt: true,
        assignment: {
          select: {
            id: true,
            track: true,
            scope: true,
            settings: true,
            dueAt: true,
            createdAt: true,
            archivedAt: true,
          },
        },
      },
    });
    return targets
      .filter((target) => target.assignment.archivedAt === null)
      .map((target) => ({
        id: target.assignment.id,
        track: target.assignment.track,
        scope: target.assignment.scope,
        settings: target.assignment.settings,
        dueAt: target.assignment.dueAt,
        createdAt: target.assignment.createdAt,
        completedAt: target.completedAt,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  });
}

export type FamilyLink = {
  readonly id: string;
  readonly guardianName: string;
  readonly state: "claimed" | "approved" | "revoked";
  readonly canTutor: boolean;
  readonly createdAt: Date;
};

export async function familyLinks(
  organizationId: string,
  learnerUserId: string,
): Promise<readonly FamilyLink[]> {
  return withTenant(organizationId, async (tx) => {
    const rows = await tx.relationship.findMany({
      where: { objectUserId: learnerUserId, kind: "guardian_child" },
      orderBy: { createdAt: "asc" },
      select: { id: true, state: true, canTutor: true, createdAt: true, subjectUserId: true },
    });
    if (rows.length === 0) return [];
    const guardians = await tx.user.findMany({
      where: { id: { in: rows.map((row) => row.subjectUserId) } },
      select: { id: true, displayName: true },
    });
    const names = new Map(guardians.map((user) => [user.id, user.displayName]));
    return rows.map((row) => ({
      id: row.id,
      guardianName: names.get(row.subjectUserId) ?? row.subjectUserId,
      state: row.state,
      canTutor: row.canTutor,
      createdAt: row.createdAt,
    }));
  });
}

/* ------------------------------------------------------- console furniture */

export async function onboardingFacts(
  organizationId: string,
  teacherUserId: string,
): Promise<OnboardingFacts> {
  return withTenant(organizationId, async (tx) => {
    const [grants, classrooms, assignments] = await Promise.all([
      tx.roleGrant.count({ where: { userId: teacherUserId, role: { in: ["teacher", "admin", "owner"] } } }),
      tx.classroom.findMany({
        where: { teacherUserId, archivedAt: null },
        select: { id: true, _count: { select: { enrollments: true } } },
      }),
      tx.assignment.count({ where: { createdByUserId: teacherUserId, archivedAt: null } }),
    ]);

    return {
      hasAccount: true,
      hasTeacherGrant: grants > 0,
      classroomCount: classrooms.length,
      enrolledLearners: classrooms.reduce((total, room) => total + room._count.enrollments, 0),
      assignmentCount: assignments,
    };
  });
}

export type NotificationRow = {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly createdAt: Date;
  readonly readAt: Date | null;
  readonly deliveryState: string;
};

export async function listNotifications(
  organizationId: string,
  userId: string,
  limit = 30,
): Promise<readonly NotificationRow[]> {
  return withTenant(organizationId, (tx) =>
    tx.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, kind: true, payload: true, createdAt: true, readAt: true, deliveryState: true },
    }),
  );
}

/**
 * Presence heartbeats, read from the append-only event log.
 *
 * Presence is not stored: it is the tail of what learners were already doing.
 * Nothing is written to make this work, so nothing has to be cleaned up, and
 * a teacher watching a class collects no data that did not already exist.
 */
export async function recentBeats(
  organizationId: string,
  learnerUserIds: readonly string[],
  since: Date,
): Promise<readonly { readonly learnerUserId: string; readonly at: Date }[]> {
  if (learnerUserIds.length === 0) return [];
  return withTenant(organizationId, async (tx) => {
    const rows = await tx.learningEvent.groupBy({
      by: ["learnerUserId"],
      where: {
        learnerUserId: { in: [...learnerUserIds] },
        occurredAt: { gte: since },
        // A teacher recording a verdict is the teacher working, not the
        // learner. Counting it would show a student as present because
        // somebody looked at them.
        source: { notIn: ["teacher_console", "system"] },
      },
      _max: { occurredAt: true },
    });
    return rows.flatMap((row) =>
      row._max.occurredAt === null ? [] : [{ learnerUserId: row.learnerUserId, at: row._max.occurredAt }],
    );
  });
}
