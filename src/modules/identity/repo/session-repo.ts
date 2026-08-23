import { withTenant } from "../../platform/db/tenant";
import { buildActor, type ResolvedActor } from "../domain/actor";
import type { ActorGrant, ActorRelationship } from "../../platform/authz/can";
import type { Tier } from "../../design/theme/tier";

/**
 * Loading the caller is a single tenant-scoped read. The session cookie is only
 * a claim about who you are; this is where that claim is checked against the
 * database, so revocation and "sign out everywhere" take effect immediately.
 */
export type SessionLookup =
  | { readonly ok: true; readonly actor: ResolvedActor; readonly expiresAt: Date; readonly issuedAt: Date }
  | { readonly ok: false; readonly reason: "no_session" | "revoked" | "expired" | "version_mismatch" | "user_disabled" };

export async function loadActorForSession(
  organizationId: string,
  sessionId: string,
  cookieVersion: number,
  now: Date,
): Promise<SessionLookup> {
  return withTenant(organizationId, async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        version: true,
        issuedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    if (!session) return { ok: false, reason: "no_session" } as const;
    if (session.revokedAt) return { ok: false, reason: "revoked" } as const;
    if (session.expiresAt <= now) return { ok: false, reason: "expired" } as const;
    // A version bump signs every device out without touching any cookie.
    if (session.version !== cookieVersion) return { ok: false, reason: "version_mismatch" } as const;

    const user = await tx.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        displayName: true,
        locale: true,
        disabledAt: true,
        learnerProfile: { select: { tier: true } },
        roleGrants: {
          select: { role: true, scopeType: true, scopeId: true, expiresAt: true },
        },
        asSubject: {
          where: { revokedAt: null },
          select: { kind: true, objectUserId: true, state: true, canTutor: true },
        },
      },
    });
    if (!user || user.disabledAt) return { ok: false, reason: "user_disabled" } as const;

    // Which learners a classroom-scoped grant actually reaches.
    const classroomIds = user.roleGrants
      .filter((g) => g.scopeType === "classroom")
      .map((g) => g.scopeId);
    const classroomLearnerIds =
      classroomIds.length === 0
        ? []
        : (
            await tx.enrollment.findMany({
              where: { classroomId: { in: classroomIds }, leftAt: null },
              select: { learnerUserId: true },
            })
          ).map((e) => e.learnerUserId);

    const grants: ActorGrant[] = user.roleGrants.map((g) => ({
      role: g.role,
      scopeType: g.scopeType,
      scopeId: g.scopeId,
      expiresAt: g.expiresAt,
    }));
    const relationships: ActorRelationship[] = user.asSubject.map((r) => ({
      kind: r.kind,
      learnerUserId: r.objectUserId,
      state: r.state,
      canTutor: r.canTutor,
    }));

    return {
      ok: true,
      expiresAt: session.expiresAt,
      issuedAt: session.issuedAt,
      actor: buildActor({
        userId: user.id,
        organizationId: session.organizationId,
        displayName: user.displayName,
        locale: user.locale,
        sessionId: session.id,
        tier: (user.learnerProfile?.tier ?? null) as Tier | null,
        grants,
        relationships,
        classroomLearnerIds,
      }),
    } as const;
  });
}

export async function revokeSession(organizationId: string, sessionId: string): Promise<void> {
  await withTenant(organizationId, (tx) =>
    tx.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }),
  );
}

/** Sign out everywhere: bump every session's version for this user. */
export async function revokeAllSessions(organizationId: string, userId: string): Promise<number> {
  return withTenant(organizationId, async (tx) => {
    const result = await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  });
}
