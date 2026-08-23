/**
 * /family/children/[childId] — the parent report.
 *
 * A guardian with a pending claim, a revoked grant, or no relationship at
 * all sees the same permission-denied state. It never confirms that the
 * child exists, because confirming existence is itself a disclosure.
 */
import { redirect } from "next/navigation";
import { ParentReport } from "../../../../src/ui/components/ParentReport.js";
import { PermissionDeniedState } from "../../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../../src/ui/i18n/context.js";
import { requireActor } from "../../../../src/server/actor.js";
import { loadChildReport } from "../../../../src/server/queries.js";

export const dynamic = "force-dynamic";

export default async function ChildReportPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const report = await loadChildReport(result.actor, childId, Date.now());
  if (!report)
    return (
      <LocaleProvider locale="en">
        <PermissionDeniedState />
      </LocaleProvider>
    );

  return (
    <LocaleProvider locale="en">
      <ParentReport
        childName={report.childName}
        weekSummary={report.weekSummary}
        quietDays={report.quietDays}
        {...(report.teacherRequest ? { teacherRequest: report.teacherRequest } : {})}
        homeTasks={report.homeTasks}
        {...(report.lastVerification
          ? { lastVerification: report.lastVerification }
          : {})}
      />
    </LocaleProvider>
  );
}
