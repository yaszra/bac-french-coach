/**
 * /family/today — a guardian's landing page.
 *
 * Lists only children with an approved, unrevoked, unexpired relationship.
 * A guardian with none sees the same page as one whose claim is pending.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";
import { requireActor } from "../../../src/server/actor.js";
import { getPool } from "../../../src/server/db.js";

export const dynamic = "force-dynamic";

export default async function FamilyTodayPage() {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const { rows } = await getPool().query(
    `SELECT c.id, c.display_name
       FROM guardian_relationship g
       JOIN app_user c ON c.id = g.child_user_id
      WHERE g.guardian_user_id = $1 AND g.organization_id = $2
        AND g.status = 'approved' AND g.can_view_child
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())`,
    [result.actor.userId, result.actor.organizationId],
  );

  return (
    <LocaleProvider locale="en">
      <main>
        <h1>Today</h1>
        {rows.length === 0 ? (
          <EmptyState heading="No children are linked to your account.">
            <p>
              <Link href="/family/permissions">Check your requests</Link>
            </p>
          </EmptyState>
        ) : (
          <ul>
            {rows.map((row) => (
              <li key={row["id"] as string}>
                <Link href={`/family/children/${row["id"] as string}`}>
                  {row["display_name"] as string}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </LocaleProvider>
  );
}
