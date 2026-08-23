/**
 * /teach/verify — the queue.
 *
 * Ordered oldest first: a learner who has been waiting two days should
 * not be overtaken by one who asked an hour ago.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";
import { requireActor } from "../../../src/server/actor.js";
import { loadVerificationQueue } from "../../../src/server/queries.js";

export const dynamic = "force-dynamic";

function waited(since: number, now: number): string {
  const hours = Math.round((now - since) / 3_600_000);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default async function VerifyQueuePage() {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const queue = await loadVerificationQueue(result.actor);
  const now = Date.now();

  return (
    <LocaleProvider locale="en">
      <main>
        <h1>Verify</h1>
        {queue.length === 0 ? (
          <EmptyState heading="No recitations are waiting.">
            <p>
              Learners appear here once they have met the evidence policy you
              set, not before.
            </p>
          </EmptyState>
        ) : (
          <ol>
            {queue.map((row) => (
              <li key={row.requestId}>
                {row.learnerName} · {row.passageLabel} · waiting{" "}
                {waited(row.requestedAt, now)}{" "}
                <Link href={`/teach/verify/${row.requestId}`}>Verify</Link>
              </li>
            ))}
          </ol>
        )}
      </main>
    </LocaleProvider>
  );
}
