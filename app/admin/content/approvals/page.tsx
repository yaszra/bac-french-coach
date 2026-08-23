/**
 * /admin/content/approvals — the release registry.
 *
 * Shows source, reviewer, credential, decision, licence territory, and
 * expiry together, because those five facts are what make content
 * releasable and any one of them missing is what stops it.
 */
import { redirect } from "next/navigation";
import { EmptyState } from "../../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../../src/ui/i18n/context.js";
import { requireActor } from "../../../../src/server/actor.js";
import { loadContentApprovals } from "../../../../src/server/queries.js";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const sources = await loadContentApprovals(result.actor);
  const now = Date.now();

  return (
    <LocaleProvider locale="en">
      <main>
        <h1>Content approvals</h1>
        <p>
          Nothing Qurʾān-adjacent becomes available without a qualified
          reviewer&rsquo;s recorded approval, an unexpired licence, and
          territorial rights covering the academy.
        </p>
        {sources.length === 0 ? (
          <EmptyState heading="No content sources are registered." />
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Approval</th>
                <th scope="col">Reviewer</th>
                <th scope="col">Licence</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const expired =
                  s.licenceExpiresAt !== null && s.licenceExpiresAt <= now;
                return (
                  <tr key={s.sourceId} data-decision={s.decision}>
                    <td>
                      {s.publisher} — {s.edition}
                    </td>
                    <td>{s.decision}</td>
                    <td>
                      {s.reviewerName
                        ? `${s.reviewerName} (${s.reviewerCredential ?? "credential not recorded"})`
                        : "not reviewed"}
                    </td>
                    <td>
                      {s.territories.length > 0 ? s.territories.join(", ") : "—"}
                      {s.licenceExpiresAt !== null
                        ? ` · ${expired ? "expired" : "expires"} ${new Date(
                            s.licenceExpiresAt,
                          )
                            .toISOString()
                            .slice(0, 10)}`
                        : " · no expiry recorded"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </LocaleProvider>
  );
}
