import { Prisma } from "@prisma/client";
import { prisma } from "./client";

/**
 * The tenant context is a transaction-local Postgres setting. Row-level
 * security policies read it, so isolation is enforced by the database rather
 * than by remembering to add `where: { organizationId }` to every query.
 *
 *     const rows = await withTenant(orgId, (tx) => tx.learnerProfile.findMany());
 *
 * Everything inside the callback runs in ONE transaction with the context set.
 * Nothing outside it can see the setting, and a thrown error rolls the whole
 * unit of work back.
 */
export type TenantClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const ORG_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function withTenant<T>(
  organizationId: string,
  work: (tx: TenantClient) => Promise<T>,
  options?: { readonly timeoutMs?: number },
): Promise<T> {
  /* The id is interpolated into a SET LOCAL, so it is validated against a
     strict shape first — Prisma's parameter binding does not apply to SET.
     The typeof check is not redundant: `RegExp.test` coerces its argument, so
     `test(undefined)` is `test("undefined")`, which matches. A job invoked
     with no organisation therefore passed this guard, set the tenant to the
     literal string "undefined", matched no rows under RLS and completed
     "successfully" having done nothing. A missing tenant must be an error,
     loudly, not an empty result set. */
  if (typeof organizationId !== "string" || !ORG_ID.test(organizationId)) {
    throw new Error("withTenant: organizationId has an unexpected shape");
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.organization_id = '${organizationId}'`);
      return work(tx);
    },
    { timeout: options?.timeoutMs ?? 10_000 },
  );
}

/**
 * Operational escape hatch for jobs that legitimately span tenants (projection
 * rebuilds, backups, erasure). It connects as the MIGRATION role, which has
 * BYPASSRLS, and is only ever called from a job — never from a request handler.
 * Every use is audited by the caller.
 */
export async function withoutTenantForMaintenance<T>(
  reason: string,
  work: (db: typeof prisma) => Promise<T>,
): Promise<T> {
  if (!process.env.DIRECT_DATABASE_URL) {
    throw new Error(`maintenance access requires DIRECT_DATABASE_URL (${reason})`);
  }
  const { PrismaClient } = await import("@prisma/client");
  const maintenance = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
  });
  try {
    return await work(maintenance);
  } finally {
    await maintenance.$disconnect();
  }
}
