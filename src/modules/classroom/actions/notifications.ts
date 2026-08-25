"use server";

import { z } from "zod";
import { withTenant } from "../../platform/db/tenant";
import { requireCaller } from "../../identity/actions/session-context";

/**
 * Marking a notification read.
 *
 * The `where` clause carries `userId` even though row-level security already
 * scopes the tenant: RLS keeps another school out, but it does not keep one
 * teacher out of another teacher's inbox inside the same school.
 */
const markReadInput = z.strictObject({ notificationId: z.string().min(1) });

export async function markNotificationRead(input: unknown): Promise<{ readonly ok: boolean }> {
  const actor = await requireCaller();
  const parsed = markReadInput.safeParse(input);
  if (!parsed.success) return { ok: false };

  const result = await withTenant(actor.organizationId, (tx) =>
    tx.notification.updateMany({
      where: { id: parsed.data.notificationId, userId: actor.userId, readAt: null },
      data: { readAt: new Date() },
    }),
  );
  return { ok: result.count > 0 };
}

export async function markAllNotificationsRead(): Promise<{ readonly ok: true; readonly count: number }> {
  const actor = await requireCaller();
  const result = await withTenant(actor.organizationId, (tx) =>
    tx.notification.updateMany({
      where: { userId: actor.userId, readAt: null },
      data: { readAt: new Date() },
    }),
  );
  return { ok: true, count: result.count };
}
