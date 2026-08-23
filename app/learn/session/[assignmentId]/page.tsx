/**
 * /learn/session/[assignmentId] — the memorization workspace.
 *
 * Opens through the command layer, which means: authorization runs first,
 * the state moves out of `assigned` on first practice, and the page comes
 * back blank. There is no branch here that could return a filled page.
 */
import { redirect } from "next/navigation";
import { LocaleProvider } from "../../../../src/ui/i18n/context.js";
import { PermissionDeniedState } from "../../../../src/ui/components/RouteStates.js";
import { requireActor } from "../../../../src/server/actor.js";
import { getDatabase } from "../../../../src/server/db.js";
import { openAssignment, CommandError } from "../../../../src/application/commands.js";
import { loadSessionLayout } from "../../../../src/server/queries.js";
import type { AssignmentId } from "../../../../src/core/types.js";
import { SessionClient } from "./SessionClient.js";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  try {
    const opened = await openAssignment(getDatabase(), {
      actor: result.actor,
      now: Date.now(),
      assignmentId: assignmentId as AssignmentId,
    });
    const layout = await loadSessionLayout(result.actor, assignmentId as AssignmentId);
    if (!layout)
      return (
        <LocaleProvider locale="en">
          <PermissionDeniedState />
        </LocaleProvider>
      );

    return (
      <LocaleProvider locale="en">
        <SessionClient
          assignmentId={assignmentId}
          segmentId={layout.segmentId}
          pageNumber={layout.pageNumber}
          lines={layout.lines}
          passageLabel={opened.label}
          listens={{
            done: opened.listensCompleted,
            required: opened.requiredListens,
          }}
          tiles={layout.tiles}
        />
      </LocaleProvider>
    );
  } catch (error) {
    if (error instanceof CommandError && error.code === "not_found")
      // Cross-tenant and missing are the same answer, by design.
      return (
        <LocaleProvider locale="en">
          <PermissionDeniedState />
        </LocaleProvider>
      );
    throw error;
  }
}
