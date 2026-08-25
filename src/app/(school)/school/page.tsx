import { getCaller } from "@/modules/identity/actions/session-context";
import { can } from "@/modules/platform/authz/can";
import { loadSchoolOverview } from "@/modules/analytics/repo/school-repo";
import { SchoolOverviewView } from "@/modules/analytics/ui/SchoolOverviewView";
import { SchoolRefusal } from "@/modules/analytics/ui/SchoolRefusal";

/**
 * The school overview.
 *
 * An administrator sees aggregates. There is no route from this page into a
 * child's recitation, a recording or a teacher's notes — not because it is
 * hidden, but because nothing here loads it.
 */
export default async function SchoolPage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") return <SchoolRefusal reasonKey="school.signedOut" />;

  const decision = can(caller.actor, "admin:viewSchoolReports", {
    type: "organization",
    id: caller.actor.organizationId,
  });
  if (!decision.allowed) return <SchoolRefusal reasonKey="school.notAllowed" />;

  const overview = await loadSchoolOverview(caller.actor.organizationId);
  return <SchoolOverviewView overview={overview} />;
}
