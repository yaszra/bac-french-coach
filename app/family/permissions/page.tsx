/**
 * /family/permissions — what a guardian can see, and how to stop it.
 *
 * Revocation is on this page, not buried in a settings menu. An adult who
 * wants to withdraw another adult's access to their child should not have
 * to look for it.
 */
import { redirect } from "next/navigation";
import { EmptyState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";
import { requireActor } from "../../../src/server/actor.js";
import { getPool } from "../../../src/server/db.js";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const { rows } = await getPool().query(
    `SELECT g.id, g.status, g.can_view_child, g.can_tutor_and_approve,
            g.claimed_at, g.approved_at, g.revoked_at, g.expires_at,
            c.display_name AS child_name
       FROM guardian_relationship g
       JOIN app_user c ON c.id = g.child_user_id
      WHERE g.guardian_user_id = $1 AND g.organization_id = $2
      ORDER BY g.claimed_at DESC`,
    [result.actor.userId, result.actor.organizationId],
  );

  return (
    <LocaleProvider locale="en">
      <main>
        <h1>Permissions</h1>
        {rows.length === 0 ? (
          <EmptyState heading="You have no relationship requests.">
            <p>
              An academy administrator can link you to a child. Until they
              approve a request, no information about a child is shown here.
            </p>
          </EmptyState>
        ) : (
          <ul>
            {rows.map((row) => {
              const revoked = row["revoked_at"] !== null;
              const pending = row["status"] === "pending";
              return (
                <li key={row["id"] as string}>
                  {/*
                    A pending row names the child only because this
                    guardian is the one who claimed them — it confirms
                    nothing they did not already assert.
                  */}
                  <strong>{row["child_name"] as string}</strong>
                  {" — "}
                  {revoked
                    ? "revoked"
                    : pending
                      ? "waiting for an administrator to decide"
                      : [
                          row["can_view_child"] ? "can view reports" : null,
                          row["can_tutor_and_approve"]
                            ? "can set and approve work"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(", ") || "approved, with no permissions granted"}
                  {row["expires_at"] ? (
                    <span>
                      {" · expires "}
                      {(row["expires_at"] as Date).toISOString().slice(0, 10)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <section aria-labelledby="athar-revoke">
          <h2 id="athar-revoke">Withdrawing access</h2>
          <p>
            Any authorized adult, and any academy administrator, can withdraw a
            tutoring permission. It stops working immediately — there is no
            session to expire and no delay.
          </p>
        </section>
      </main>
    </LocaleProvider>
  );
}
