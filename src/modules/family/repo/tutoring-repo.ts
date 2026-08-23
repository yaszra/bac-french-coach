import { withTenant } from "../../platform/db/tenant";

/**
 * A tutoring guardian's own work, and the boundary around it.
 *
 * A guardian with `canTutor` may set work and approve what they set — nothing
 * else. Approving is not re-implemented here: the verdict goes through the
 * assessment module's one verdict path, the same one a teacher's word travels.
 * This file only answers "is this request theirs to decide?".
 */

export type GuardianAssignment = {
  readonly id: string;
  readonly track: string;
  readonly scope: unknown;
  readonly dueAt: Date | null;
  readonly createdAt: Date;
  readonly completedTargets: number;
  readonly targets: number;
};

export async function assignHomeWork(
  organizationId: string,
  input: {
    guardianUserId: string;
    learnerUserId: string;
    track: "hifz" | "reading" | "review";
    /** References only — sūrah and āyah numbers. Never Arabic text. */
    scope: { sura: number; ayahFrom: number; ayahTo: number };
    dueAt?: Date | null;
  },
): Promise<string> {
  return withTenant(organizationId, async (tx) => {
    const assignment = await tx.assignment.create({
      data: {
        organizationId,
        createdByUserId: input.guardianUserId,
        track: input.track,
        scope: input.scope,
        dueAt: input.dueAt ?? null,
        targets: { create: [{ learnerUserId: input.learnerUserId }] },
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: input.guardianUserId,
        action: "family.work_assigned",
        resourceType: "assignment",
        resourceId: assignment.id,
        metadata: { learnerUserId: input.learnerUserId, track: input.track },
      },
    });
    return assignment.id;
  });
}

export async function listGuardianAssignments(
  organizationId: string,
  guardianUserId: string,
  learnerUserId: string,
): Promise<readonly GuardianAssignment[]> {
  return withTenant(organizationId, async (tx) => {
    const rows = await tx.assignment.findMany({
      where: {
        createdByUserId: guardianUserId,
        archivedAt: null,
        targets: { some: { learnerUserId } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        track: true,
        scope: true,
        dueAt: true,
        createdAt: true,
        targets: { select: { completedAt: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      track: row.track,
      scope: row.scope,
      dueAt: row.dueAt,
      createdAt: row.createdAt,
      targets: row.targets.length,
      completedTargets: row.targets.filter((t) => t.completedAt !== null).length,
    }));
  });
}

/**
 * May this guardian decide this verification request?
 *
 * Only when the request names an assignment they themselves created for this
 * learner. A guardian who tutors is not a second teacher: work someone else set
 * is heard by whoever set it.
 */
export async function guardianOwnsRequest(
  organizationId: string,
  guardianUserId: string,
  verificationRequestId: string,
): Promise<{ readonly ok: true; readonly learnerUserId: string } | { readonly ok: false; readonly reason: "unknown_request" | "not_your_assignment" }> {
  return withTenant(organizationId, async (tx) => {
    const request = await tx.verificationRequest.findUnique({
      where: { id: verificationRequestId },
      select: { learnerUserId: true, unitScope: true },
    });
    if (!request) return { ok: false, reason: "unknown_request" } as const;

    const assignmentId = (request.unitScope as { assignmentId?: unknown } | null)?.assignmentId;
    if (typeof assignmentId !== "string") return { ok: false, reason: "not_your_assignment" } as const;

    const assignment = await tx.assignment.findFirst({
      where: { id: assignmentId, createdByUserId: guardianUserId },
      select: { id: true },
    });
    return assignment
      ? ({ ok: true, learnerUserId: request.learnerUserId } as const)
      : ({ ok: false, reason: "not_your_assignment" } as const);
  });
}

/** Verdicts on this learner in a window, with who decided them and in what capacity. */
export async function approvalsFor(
  organizationId: string,
  learnerUserId: string,
  from: Date,
  to: Date,
): Promise<readonly { unitCount: number; decidedByUserId: string; decidedByName: string; isGuardian: boolean }[]> {
  return withTenant(organizationId, async (tx) => {
    const verdicts = await tx.verdict.findMany({
      where: { decidedAt: { gte: from, lte: to }, request: { learnerUserId } },
      select: { decidedByUserId: true, corrections: true, request: { select: { unitScope: true } } },
    });
    if (verdicts.length === 0) return [];

    const deciderIds = [...new Set(verdicts.map((v) => v.decidedByUserId))];
    const [users, guardianLinks] = await Promise.all([
      tx.user.findMany({ where: { id: { in: deciderIds } }, select: { id: true, displayName: true } }),
      tx.relationship.findMany({
        where: { kind: "guardian_child", objectUserId: learnerUserId, subjectUserId: { in: deciderIds } },
        select: { subjectUserId: true },
      }),
    ]);
    const nameOf = new Map(users.map((u) => [u.id, u.displayName]));
    const guardians = new Set(guardianLinks.map((g) => g.subjectUserId));

    return verdicts.map((verdict) => ({
      unitCount: ((verdict.request.unitScope as { unitIds?: unknown } | null)?.unitIds as unknown[] | undefined)?.length ?? 1,
      decidedByUserId: verdict.decidedByUserId,
      decidedByName: nameOf.get(verdict.decidedByUserId) ?? verdict.decidedByUserId,
      isGuardian: guardians.has(verdict.decidedByUserId),
    }));
  });
}
