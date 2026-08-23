/**
 * /teach/today — the attention inbox.
 *
 * The read model is assembled here from the transactional tables. In
 * production this query moves to a worker-refreshed read model (docs/07);
 * it is written directly for now because there is one academy, and a read
 * model with no measured need is complexity without evidence.
 */
import { redirect } from "next/navigation";
import { AttentionInbox } from "../../../src/ui/components/AttentionInbox.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";
import { requireActor } from "../../../src/server/actor.js";
import { loadAttentionInbox } from "../../../src/server/queries.js";
import { openAttentionRow } from "../actions.js";

export const dynamic = "force-dynamic";

export default async function TeacherTodayPage() {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const inbox = await loadAttentionInbox(result.actor, Date.now());
  return (
    <LocaleProvider locale="en">
      <AttentionInbox inbox={inbox} onAct={openAttentionRow} />
    </LocaleProvider>
  );
}
