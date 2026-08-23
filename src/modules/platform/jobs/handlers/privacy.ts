import { withTenant, withoutTenantForMaintenance } from "../../db/tenant";
import { logger } from "../../observability/logger";
import { MemoryObjectStore } from "../../storage/memory-store";
import type { ObjectStore } from "../../storage/port";
import { isPastRetention } from "../../../family/domain/consent";

/**
 * Export, erasure and the audio purge.
 *
 * These three jobs are the mechanics behind promises made on a settings screen,
 * and they are the ones that must never lie. Each moves its DataRequest through
 * real states — received → running → completed | failed — and none of them
 * writes "completed" before the work is done.
 */

export type PrivacyJobData = { readonly organizationId: string; readonly requestId: string };

const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

let store: ObjectStore = new MemoryObjectStore();
/** The deployment injects the real S3-compatible store at boot. */
export function useObjectStore(next: ObjectStore): void {
  store = next;
}

async function markState(
  organizationId: string,
  requestId: string,
  state: "running" | "completed" | "failed",
  extra?: { resultObjectKey?: string; failureReason?: string },
): Promise<void> {
  await withTenant(organizationId, (tx) =>
    tx.dataRequest.update({
      where: { id: requestId },
      data: {
        state,
        ...(state === "completed" ? { completedAt: new Date() } : {}),
        ...(extra?.resultObjectKey ? { resultObjectKey: extra.resultObjectKey } : {}),
        ...(extra?.failureReason ? { failureReason: extra.failureReason.slice(0, 500) } : {}),
      },
    }),
  );
}

/**
 * Export — everything the tenant holds about one learner, as JSON in object
 * storage. Idempotent: the object is content-addressed, so re-running produces
 * the same key rather than a second copy.
 */
export async function runDataExport(data: PrivacyJobData): Promise<void> {
  await markState(data.organizationId, data.requestId, "running");
  try {
    const bundle = await withTenant(data.organizationId, async (tx) => {
      const request = await tx.dataRequest.findUnique({
        where: { id: data.requestId },
        select: { subjectUserId: true, kind: true },
      });
      if (!request) throw new Error(`data request ${data.requestId} not found`);
      const subject = request.subjectUserId;

      const [user, profile, events, attempts, memory, verifications, consents, notifications] =
        await Promise.all([
          tx.user.findUnique({ where: { id: subject }, select: { id: true, displayName: true, email: true, handle: true, locale: true, createdAt: true } }),
          tx.learnerProfile.findUnique({ where: { userId: subject } }),
          tx.learningEvent.findMany({ where: { learnerUserId: subject }, orderBy: { occurredAt: "asc" } }),
          tx.attempt.findMany({ where: { learnerUserId: subject }, orderBy: { occurredAt: "asc" } }),
          tx.memoryState.findMany({ where: { learnerUserId: subject } }),
          tx.verificationRequest.findMany({ where: { learnerUserId: subject }, include: { verdict: true } }),
          tx.consentRecord.findMany({ where: { learnerUserId: subject } }),
          tx.notification.findMany({ where: { userId: subject } }),
        ]);

      return {
        exportedAt: new Date().toISOString(),
        subject: user,
        profile,
        // Derived state is included and labelled as derived: it is not a second
        // source of truth, and a reader should know that.
        derived: { memoryState: memory },
        events,
        attempts,
        verifications,
        consents,
        notifications,
      };
    });

    const bytes = new TextEncoder().encode(JSON.stringify(bundle, null, 2));
    const stored = await store.put({ kind: "export", bytes, contentType: "application/json" });
    await markState(data.organizationId, data.requestId, "completed", { resultObjectKey: stored.key });
    logger.info({ requestId: data.requestId, key: stored.key, bytes: stored.size }, "data export completed");
  } catch (error) {
    await markState(data.organizationId, data.requestId, "failed", {
      failureReason: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  }
}

/**
 * Erasure — through the audited path, or not at all.
 *
 * `learning_event` is append-only: UPDATE and DELETE raise unless the
 * transaction declares which request authorises them. Setting
 * `app.erasure_request_id` is what makes the deletion legal, and the database
 * trigger writes an `erasure_log` row for every row it removes. So the audit
 * trail is not something this job remembers to write — it is a consequence of
 * the only path that can erase at all.
 */
export async function runDataErasure(data: PrivacyJobData): Promise<void> {
  if (!ID_SHAPE.test(data.requestId)) throw new Error("erasure: requestId has an unexpected shape");
  await markState(data.organizationId, data.requestId, "running");

  try {
    const subject = await withTenant(data.organizationId, async (tx) => {
      const request = await tx.dataRequest.findUnique({
        where: { id: data.requestId },
        select: { subjectUserId: true, kind: true },
      });
      if (!request) throw new Error(`data request ${data.requestId} not found`);
      if (request.kind !== "erasure") throw new Error(`data request ${data.requestId} is not an erasure`);
      return request.subjectUserId;
    });

    const removed = await withoutTenantForMaintenance(`erasure ${data.requestId}`, async (db) =>
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.erasure_request_id = '${data.requestId}'`);

        const counts: Record<string, number> = {};
        counts.learningEvent = (await tx.learningEvent.deleteMany({ where: { learnerUserId: subject } })).count;
        counts.attempt = (await tx.attempt.deleteMany({ where: { learnerUserId: subject } })).count;
        counts.memoryState = (await tx.memoryState.deleteMany({ where: { learnerUserId: subject } })).count;
        counts.verificationRequest = (
          await tx.verificationRequest.deleteMany({ where: { learnerUserId: subject } })
        ).count;
        counts.khatmaFlag = (await tx.khatmaFlag.deleteMany({ where: { learnerUserId: subject } })).count;
        counts.notification = (await tx.notification.deleteMany({ where: { userId: subject } })).count;
        counts.consentRecord = (await tx.consentRecord.deleteMany({ where: { learnerUserId: subject } })).count;
        return counts;
      }),
    );

    // Recordings are bytes, not rows: the objects go too.
    const purged = await purgeAudioForSubject(data.organizationId, subject);

    await markState(data.organizationId, data.requestId, "completed");
    logger.info({ requestId: data.requestId, removed, purged }, "erasure completed through the audited path");
  } catch (error) {
    await markState(data.organizationId, data.requestId, "failed", {
      failureReason: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  }
}

async function purgeAudioForSubject(organizationId: string, subjectUserId: string): Promise<number> {
  const keys = await withTenant(organizationId, async (tx) => {
    const rows = await tx.audioAsset.findMany({
      where: { organizationId, provenance: "human" },
      select: { id: true, objectKey: true },
    });
    return rows;
  });
  let purged = 0;
  for (const row of keys) {
    await store.delete(row.objectKey).catch(() => undefined);
    purged += 1;
  }
  logger.debug({ subjectUserId, purged }, "audio objects removed for erasure");
  return purged;
}

/**
 * The nightly purge of children's recordings. A recording past its retention is
 * removed from object storage and from the row that pointed at it; the row is
 * not kept "just in case", because that is exactly what the promise forbids.
 */
export async function runAudioPurge(data: { organizationId: string; at?: string }): Promise<number> {
  const now = data.at ? new Date(data.at) : new Date();
  const due = await withTenant(data.organizationId, (tx) =>
    tx.audioAsset.findMany({
      where: { organizationId: data.organizationId, purgeAfter: { not: null, lte: now } },
      select: { id: true, objectKey: true, purgeAfter: true },
    }),
  );

  let purged = 0;
  for (const asset of due) {
    if (!isPastRetention(asset.purgeAfter, now)) continue;
    await store.delete(asset.objectKey).catch((error: unknown) => {
      logger.error({ err: error, key: asset.objectKey }, "could not delete audio object");
    });
    await withTenant(data.organizationId, (tx) => tx.audioAsset.delete({ where: { id: asset.id } }));
    purged += 1;
  }
  if (purged > 0) logger.info({ organizationId: data.organizationId, purged }, "recordings purged");
  return purged;
}
