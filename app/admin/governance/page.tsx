/**
 * /admin/governance — claims, grants, and data requests.
 *
 * These are product workflows with audit trails, not things an engineer
 * does with psql. This page is where an administrator does them.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState, PermissionDeniedState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";
import { requireActor } from "../../../src/server/actor.js";
import { getPool } from "../../../src/server/db.js";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const isAdmin = result.actor.roles.some(
    (r) =>
      r.role === "org_admin" ||
      r.role === "academy_admin" ||
      r.role === "academic_director",
  );
  if (!isAdmin)
    return (
      <LocaleProvider locale="en">
        <PermissionDeniedState />
      </LocaleProvider>
    );

  const { rows } = await getPool().query(
    `SELECT g.id, g.status, g.can_view_child, g.can_tutor_and_approve,
            g.claimed_at, g.revoked_at,
            gu.display_name AS guardian_name,
            c.display_name AS child_name
       FROM guardian_relationship g
       JOIN app_user gu ON gu.id = g.guardian_user_id
       JOIN app_user c ON c.id = g.child_user_id
      WHERE g.organization_id = $1
      ORDER BY (g.status = 'pending') DESC, g.claimed_at DESC`,
    [result.actor.organizationId],
  );

  const pending = rows.filter((r) => r["status"] === "pending");

  return (
    <LocaleProvider locale="en">
      <main>
        <h1>Governance</h1>

        <section aria-labelledby="athar-pending">
          <h2 id="athar-pending">Waiting for a decision ({pending.length})</h2>
          {pending.length === 0 ? (
            <EmptyState heading="No claims are waiting." />
          ) : (
            <ul>
              {pending.map((row) => (
                <li key={row["id"] as string}>
                  {row["guardian_name"] as string} claims a relationship with{" "}
                  {row["child_name"] as string}, requested{" "}
                  {(row["claimed_at"] as Date).toISOString().slice(0, 10)}.
                  {/*
                    Viewing and tutoring are granted separately, so the
                    decision is two decisions, not one.
                  */}
                  <span> Grant viewing and tutoring separately.</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="athar-all">
          <h2 id="athar-all">All relationships</h2>
          <ul>
            {rows.map((row) => (
              <li key={`all-${row["id"] as string}`}>
                {row["guardian_name"] as string} → {row["child_name"] as string} ·{" "}
                {row["revoked_at"] !== null ? "revoked" : (row["status"] as string)}
                {row["can_view_child"] ? " · can view" : ""}
                {row["can_tutor_and_approve"] ? " · can tutor" : ""}
              </li>
            ))}
          </ul>
        </section>

        <p>
          <Link href="/admin/audit">Every decision here is recorded in the audit log</Link>
        </p>
      </main>
    </LocaleProvider>
  );
}
