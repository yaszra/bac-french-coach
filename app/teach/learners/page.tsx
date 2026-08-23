/**
 * /teach/learners — the roster.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";
import { requireActor } from "../../../src/server/actor.js";
import { loadAssignableContext } from "../../../src/server/queries.js";

export const dynamic = "force-dynamic";

export default async function LearnersPage() {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const { learners } = await loadAssignableContext(result.actor);
  return (
    <LocaleProvider locale="en">
      <main>
        <h1>Learners</h1>
        {learners.length === 0 ? (
          <EmptyState heading="No learners are enrolled in your classes.">
            <p>An academy administrator can enrol learners into your classroom.</p>
          </EmptyState>
        ) : (
          <ul>
            {learners.map((l) => (
              <li key={l.learnerId}>
                <Link href={`/teach/learners/${l.learnerId}`}>{l.displayName}</Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </LocaleProvider>
  );
}
