import { withoutTenantForMaintenance } from "../../db/tenant";
import { logger } from "../../observability/logger";
import { enqueue, type JobName } from "../queue";

/**
 * The step between a schedule and the work.
 *
 * Every recurring job in Itqān is per-organisation: a report is a school's
 * report, a purge is a school's purge, and each handler opens a tenant
 * transaction with the id it is given. A cron trigger has no organisation, so
 * something has to turn one nightly tick into one job per school.
 *
 * Nothing did. The worker scheduled every job with an empty payload, so every
 * handler ran with `organizationId` undefined — and because `RegExp.test`
 * coerces, the tenancy guard accepted the string "undefined", RLS matched no
 * rows, and the job reported success having done nothing. Reports were never
 * built and recordings were never purged, silently, for as long as the worker
 * ran. This is the missing step, and `withTenant` now refuses a non-string so
 * the same mistake cannot be quiet twice.
 */
export type FanOutResult = { readonly organizations: number };

/** Enumerating organisations is maintenance work: it is the one query that is deliberately not tenant-scoped. */
export async function organizationIds(): Promise<readonly string[]> {
  return withoutTenantForMaintenance("fan a scheduled job out to every organisation", async (db) => {
    const rows = await db.organization.findMany({ select: { id: true }, orderBy: { id: "asc" } });
    return rows.map((row) => row.id);
  });
}

/**
 * Queue `job` once per organisation, carrying the payload each handler expects.
 *
 * The per-organisation jobs keep their own queue policies, so a school whose
 * report is already queued does not get a second one.
 */
export async function fanOutToOrganizations(
  job: JobName,
  at: Date = new Date(),
): Promise<FanOutResult> {
  const ids = await organizationIds();
  for (const organizationId of ids) {
    await enqueue(job, { organizationId, at: at.toISOString() });
  }
  logger.info({ job, organizations: ids.length }, "scheduled job fanned out");
  return { organizations: ids.length };
}
