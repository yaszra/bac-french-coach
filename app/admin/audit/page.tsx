/**
 * /admin/audit — the audit log.
 *
 * Includes denied attempts, not only successful actions: who tried matters
 * as much as who succeeded.
 */
import { redirect } from "next/navigation";
import { EmptyState, PermissionDeniedState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";
import { requireActor } from "../../../src/server/actor.js";
import { loadAuditLog } from "../../../src/server/queries.js";
import { authorize } from "../../../src/auth/policy.js";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const decision = authorize(
    result.actor,
    "audit.read",
    { kind: "audit_log", organizationId: result.actor.organizationId },
    { guardianRelationships: [], enrollments: [], now: Date.now() },
  );
  if (!decision.allowed)
    return (
      <LocaleProvider locale="en">
        <PermissionDeniedState />
      </LocaleProvider>
    );

  const entries = await loadAuditLog(result.actor);
  return (
    <LocaleProvider locale="en">
      <main>
        <h1>Audit</h1>
        {entries.length === 0 ? (
          <EmptyState heading="No audited actions recorded yet." />
        ) : (
          <table>
            <caption>Identity, permissions, content release, and data requests</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">Action</th>
                <th scope="col">Outcome</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.occurredAt}:${e.action}`} data-outcome={e.outcome}>
                  <td>{new Date(e.occurredAt).toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td>{e.actorName ?? "system"}</td>
                  <td>{e.action}</td>
                  <td>{e.outcome}</td>
                  <td>{e.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </LocaleProvider>
  );
}
