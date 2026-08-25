import { withTenant, type TenantClient } from "../../platform/db/tenant";
import { decideClaim, type ClaimOutcome } from "../domain/claim";

/**
 * Reading and writing the family's side of the relationship graph.
 *
 * The invariant this file protects: a claim is a row, not a permission. Nothing
 * here returns a child's learning data — `listChildren` returns names and link
 * states only, and every screen that wants more asks `can()` first.
 */

export type ChildLink = {
  readonly learnerUserId: string;
  readonly displayName: string;
  readonly state: "claimed" | "approved" | "revoked";
  readonly canTutor: boolean;
  readonly timezone: string;
  readonly classroomName: string | null;
  readonly approvedAt: Date | null;
};

export async function listChildren(
  organizationId: string,
  guardianUserId: string,
): Promise<readonly ChildLink[]> {
  return withTenant(organizationId, async (tx) => {
    const links = await tx.relationship.findMany({
      where: { kind: "guardian_child", subjectUserId: guardianUserId, state: { not: "revoked" } },
      select: { objectUserId: true, state: true, canTutor: true, approvedAt: true },
      orderBy: { createdAt: "asc" },
    });
    if (links.length === 0) return [];

    const ids = links.map((link) => link.objectUserId);
    const [users, profiles, enrolments] = await Promise.all([
      tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }),
      tx.learnerProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, timezone: true } }),
      tx.enrollment.findMany({
        where: { learnerUserId: { in: ids }, leftAt: null },
        select: { learnerUserId: true, classroom: { select: { name: true } } },
      }),
    ]);
    const nameOf = new Map(users.map((u) => [u.id, u.displayName]));
    const tzOf = new Map(profiles.map((p) => [p.userId, p.timezone]));
    const classOf = new Map(enrolments.map((e) => [e.learnerUserId, e.classroom.name]));

    return links.map((link) => ({
      learnerUserId: link.objectUserId,
      displayName: nameOf.get(link.objectUserId) ?? link.objectUserId,
      state: link.state,
      canTutor: link.canTutor,
      timezone: tzOf.get(link.objectUserId) ?? "UTC",
      classroomName: classOf.get(link.objectUserId) ?? null,
      approvedAt: link.approvedAt,
    }));
  });
}

export type ClaimResult =
  | { readonly ok: true; readonly outcome: ClaimOutcome; readonly childName: string; readonly learnerUserId: string }
  | { readonly ok: false; readonly reason: "unknown_code" | "already_linked" };

/**
 * Claim a child by their code.
 *
 * The whole transaction is one unit of work: we look the learner up, ask
 * whether anyone is there to approve the claim, and write the relationship in
 * the state that answer implies — `claimed` when a teacher must be asked,
 * `approved` only when there is genuinely nobody to ask.
 */
export async function claimChild(
  organizationId: string,
  guardianUserId: string,
  code: string,
  now: Date = new Date(),
): Promise<ClaimResult> {
  return withTenant(organizationId, async (tx) => {
    const learner = await findLearnerByCode(tx, code);
    if (!learner) return { ok: false, reason: "unknown_code" } as const;

    const existing = await tx.relationship.findUnique({
      where: {
        kind_subjectUserId_objectUserId: {
          kind: "guardian_child",
          subjectUserId: guardianUserId,
          objectUserId: learner.id,
        },
      },
      select: { state: true },
    });
    if (existing && existing.state !== "revoked") return { ok: false, reason: "already_linked" } as const;

    const teacherLinks = await tx.relationship.count({
      where: { kind: "teacher_student", objectUserId: learner.id, state: "approved" },
    });
    const outcome = decideClaim({ hasApprovedTeacher: teacherLinks > 0 });

    await tx.relationship.upsert({
      where: {
        kind_subjectUserId_objectUserId: {
          kind: "guardian_child",
          subjectUserId: guardianUserId,
          objectUserId: learner.id,
        },
      },
      create: {
        organizationId,
        kind: "guardian_child",
        subjectUserId: guardianUserId,
        objectUserId: learner.id,
        state: outcome.state,
        // Tutoring is granted deliberately by a teacher, never by claiming.
        canTutor: false,
        ...(outcome.state === "approved" ? { approvedAt: now, approvedBy: null } : {}),
      },
      update: {
        state: outcome.state,
        revokedAt: null,
        ...(outcome.state === "approved" ? { approvedAt: now } : { approvedAt: null }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: guardianUserId,
        action: "family.claim_made",
        resourceType: "relationship",
        resourceId: learner.id,
        metadata: { state: outcome.state, decidedBy: outcome.approvedBy },
      },
    });

    return {
      ok: true,
      outcome,
      childName: learner.displayName,
      learnerUserId: learner.id,
    } as const;
  });
}

async function findLearnerByCode(
  tx: TenantClient,
  code: string,
): Promise<{ id: string; displayName: string } | null> {
  const candidates = await tx.user.findMany({
    where: { handle: { not: null }, learnerProfile: { isNot: null } },
    select: { id: true, displayName: true, handle: true },
  });
  const match = candidates.find((row) => (row.handle ?? "").trim().toUpperCase() === code);
  return match ? { id: match.id, displayName: match.displayName } : null;
}

/** Who approved a verdict, and in what capacity — never "a teacher" by default. */
export async function approverRoleOf(
  organizationId: string,
  approverUserId: string,
  learnerUserId: string,
): Promise<"teacher" | "guardian_tutor"> {
  return withTenant(organizationId, async (tx) => {
    const guardianLink = await tx.relationship.findUnique({
      where: {
        kind_subjectUserId_objectUserId: {
          kind: "guardian_child",
          subjectUserId: approverUserId,
          objectUserId: learnerUserId,
        },
      },
      select: { state: true },
    });
    return guardianLink?.state === "approved" ? "guardian_tutor" : "teacher";
  });
}
