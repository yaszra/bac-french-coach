import { withTenant } from "../../platform/db/tenant";
import {
  DEFAULT_RETENTION_DAYS,
  summarize,
  type ConsentPurpose,
  type ConsentRecordLike,
  type ConsentSummary,
} from "../domain/consent";

/**
 * Consent, export and erasure — the guardian's side of a child's data rights.
 *
 * Nothing here completes anything. A request is RECEIVED here and a job does
 * the work; the screen shows the state the row actually holds, so "completed"
 * is only ever written by the thing that finished.
 */

export async function readConsents(
  organizationId: string,
  learnerUserId: string,
  purposes: readonly ConsentPurpose[],
  now: Date = new Date(),
): Promise<readonly ConsentSummary[]> {
  return withTenant(organizationId, async (tx) => {
    const rows = await tx.consentRecord.findMany({
      where: { learnerUserId, purpose: { in: [...purposes] } },
      select: { purpose: true, granted: true, grantedAt: true, revokedAt: true, retentionDays: true },
    });
    const byPurpose = new Map<string, ConsentRecordLike>(rows.map((row) => [row.purpose, row]));
    return purposes.map((purpose) => summarize(purpose, byPurpose.get(purpose) ?? null, now));
  });
}

export async function setConsent(
  organizationId: string,
  input: {
    learnerUserId: string;
    purpose: ConsentPurpose;
    granted: boolean;
    grantedByUserId: string;
    retentionDays?: number;
  },
  now: Date = new Date(),
): Promise<void> {
  await withTenant(organizationId, async (tx) => {
    const retentionDays = input.retentionDays ?? DEFAULT_RETENTION_DAYS;
    await tx.consentRecord.upsert({
      where: { learnerUserId_purpose: { learnerUserId: input.learnerUserId, purpose: input.purpose } },
      create: {
        organizationId,
        learnerUserId: input.learnerUserId,
        purpose: input.purpose,
        granted: input.granted,
        grantedByUserId: input.grantedByUserId,
        grantedAt: now,
        revokedAt: input.granted ? null : now,
        retentionDays,
      },
      update: {
        granted: input.granted,
        grantedByUserId: input.grantedByUserId,
        ...(input.granted ? { grantedAt: now } : {}),
        revokedAt: input.granted ? null : now,
        retentionDays,
      },
    });

    /* Withdrawal is not a preference change; it is a promise about bytes. The
       purge date on every recording already made of THIS CHILD moves to now.
       Two things were wrong here and both mattered: the statement matched on
       the organisation, so withdrawing consent for one child moved the purge
       date on every child's recordings in the school; and `purgeAfter IS NOT
       NULL` skipped exactly the recordings that had never been given a purge
       date, which are the ones most in need of one. */
    if (!input.granted && input.purpose === "voice_recording") {
      await tx.$executeRawUnsafe(
        `UPDATE audio_asset SET "purgeAfter" = $1 WHERE "organizationId" = $2 AND provenance = 'human' AND "learnerUserId" = $3`,
        now,
        organizationId,
        input.learnerUserId,
      );
    }

    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: input.grantedByUserId,
        action: input.granted ? "privacy.consent_granted" : "privacy.consent_withdrawn",
        resourceType: "learner",
        resourceId: input.learnerUserId,
        metadata: { purpose: input.purpose },
      },
    });
  });
}

export type DataRequestRow = {
  readonly id: string;
  readonly kind: "export" | "erasure";
  readonly state: "received" | "running" | "completed" | "failed";
  readonly requestedAt: Date;
  readonly completedAt: Date | null;
  readonly resultObjectKey: string | null;
  readonly failureReason: string | null;
};

export async function listDataRequests(
  organizationId: string,
  subjectUserId: string,
): Promise<readonly DataRequestRow[]> {
  return withTenant(organizationId, async (tx) => {
    const rows = await tx.dataRequest.findMany({
      where: { subjectUserId },
      orderBy: { requestedAt: "desc" },
      take: 20,
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as DataRequestRow["kind"],
      state: row.state as DataRequestRow["state"],
      requestedAt: row.requestedAt,
      completedAt: row.completedAt,
      resultObjectKey: row.resultObjectKey,
      failureReason: row.failureReason,
    }));
  });
}

export async function createDataRequest(
  organizationId: string,
  input: { subjectUserId: string; kind: "export" | "erasure"; requestedBy: string },
): Promise<string> {
  return withTenant(organizationId, async (tx) => {
    const row = await tx.dataRequest.create({
      data: {
        organizationId,
        subjectUserId: input.subjectUserId,
        kind: input.kind,
        state: "received",
        requestedBy: input.requestedBy,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: input.requestedBy,
        action: `privacy.${input.kind}_requested`,
        resourceType: "data_request",
        resourceId: row.id,
        metadata: { subject: input.subjectUserId },
      },
    });
    return row.id;
  });
}
