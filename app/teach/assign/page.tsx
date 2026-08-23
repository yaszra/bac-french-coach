/**
 * /teach/assign — the four-step wizard.
 */
import { redirect } from "next/navigation";
import { AssignmentWizard } from "../../../src/ui/components/AssignmentWizard.js";
import { EmptyState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";
import { requireActor } from "../../../src/server/actor.js";
import { loadAssignableContext } from "../../../src/server/queries.js";
import { assignWork } from "../actions.js";

export const dynamic = "force-dynamic";

export default async function AssignPage() {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const { learners, passages } = await loadAssignableContext(result.actor);
  if (learners.length === 0)
    return (
      <LocaleProvider locale="en">
        <main>
          <h1>Assign</h1>
          <EmptyState heading="No learners are assigned to your classes yet.">
            <p>An academy administrator can enrol learners into your classroom.</p>
          </EmptyState>
        </main>
      </LocaleProvider>
    );

  return (
    <LocaleProvider locale="en">
      <AssignmentWizard
        learners={learners}
        passages={passages}
        onAssign={assignWork}
      />
    </LocaleProvider>
  );
}
