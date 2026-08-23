/**
 * /teach/verify/[requestId] — the verification workspace.
 *
 * Loads exactly what the teacher needs to make one decision: the expected
 * passage, who assigned it, what corrections are already open, and the cue
 * history. Nothing on this screen recommends a decision.
 */
import { redirect } from "next/navigation";
import { VerificationWorkspace } from "../../../../src/ui/components/VerificationWorkspace.js";
import { PermissionDeniedState } from "../../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../../src/ui/i18n/context.js";
import { requireActor } from "../../../../src/server/actor.js";
import { loadVerificationContext } from "../../../../src/server/queries.js";
import { decide } from "../../actions.js";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const context = await loadVerificationContext(result.actor, requestId);
  // A request in another tenant, or one this teacher may not verify, is
  // indistinguishable from one that does not exist.
  if (!context)
    return (
      <LocaleProvider locale="en">
        <PermissionDeniedState />
      </LocaleProvider>
    );

  return (
    <LocaleProvider locale="en">
      <VerificationWorkspace
        learnerName={context.learnerName}
        passageLabel={context.passageLabel}
        policyVersion={context.policyVersion}
        assignedBy={context.assignedBy}
        priorCorrections={context.priorCorrections}
        cueHistory={context.cueHistory}
        onDecide={decide.bind(null, requestId)}
      />
    </LocaleProvider>
  );
}
