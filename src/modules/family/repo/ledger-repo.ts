import { withTenant } from "../../platform/db/tenant";
import { assertFamilyEventType, type FamilyLedgerEntry } from "../domain/home-task";

/**
 * The family ledger: what a household did together.
 *
 * It is deliberately a different store from the learning event stream. Rows
 * here are audit entries — a record that an evening happened — and no
 * projection reads them, because the only reader of the learning stream is the
 * memory projection and family types cannot enter that stream at all.
 *
 * If this file ever imported `appendEvent`, the guard in `assertFamilyEventType`
 * plus the zod enum on `LearningEventInput` would both refuse it.
 */

export async function recordFamilyEntry(
  organizationId: string,
  entry: FamilyLedgerEntry,
): Promise<void> {
  assertFamilyEventType(entry.type);
  await withTenant(organizationId, async (tx) => {
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: entry.byUserId,
        action: entry.type,
        resourceType: "home_task",
        resourceId: entry.taskId,
        occurredAt: entry.occurredAt,
        metadata: {
          learnerUserId: entry.learnerUserId,
          taskId: entry.taskId,
          // Written into the row so nobody reading this table later mistakes it
          // for evidence of mastery.
          isEvidence: false,
        },
      },
    });
  });
}

export type LedgerEntry = {
  readonly taskId: string;
  readonly at: Date;
  readonly byUserId: string | null;
};

export async function recentHomeTasks(
  organizationId: string,
  learnerUserId: string,
  since: Date,
): Promise<readonly LedgerEntry[]> {
  return withTenant(organizationId, async (tx) => {
    const rows = await tx.auditLog.findMany({
      where: {
        action: "family.home_task.completed",
        resourceType: "home_task",
        occurredAt: { gte: since },
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    });
    return rows
      .filter((row) => (row.metadata as { learnerUserId?: string }).learnerUserId === learnerUserId)
      .map((row) => ({ taskId: row.resourceId, at: row.occurredAt, byUserId: row.actorUserId }));
  });
}
