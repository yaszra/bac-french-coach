/**
 * /teach/learners/[learnerId] — the learner profile.
 *
 * Independent and assisted attempts are shown side by side with their
 * counts, never merged into a single figure: the gap between them is the
 * most useful thing on this page.
 */
import { redirect } from "next/navigation";
import { PermissionDeniedState } from "../../../../src/ui/components/RouteStates.js";
import { HonestMetric } from "../../../../src/ui/components/HonestMetric.js";
import { LocaleProvider } from "../../../../src/ui/i18n/context.js";
import { requireActor } from "../../../../src/server/actor.js";
import { loadLearnerProfile } from "../../../../src/server/queries.js";

export const dynamic = "force-dynamic";

export default async function LearnerProfilePage({
  params,
}: {
  params: Promise<{ learnerId: string }>;
}) {
  const { learnerId } = await params;
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const profile = await loadLearnerProfile(result.actor, learnerId);
  if (!profile)
    return (
      <LocaleProvider locale="en">
        <PermissionDeniedState />
      </LocaleProvider>
    );

  const totalAttempts = profile.independentAttempts + profile.assistedAttempts;

  return (
    <LocaleProvider locale="en">
      <main>
        <h1>{profile.displayName}</h1>

        <section aria-labelledby="athar-evidence">
          <h2 id="athar-evidence">Evidence</h2>
          <HonestMetric
            label="Recalled on their own"
            count={profile.independentAttempts}
            total={totalAttempts}
          />
          <HonestMetric
            label="With the words shown or with help"
            count={profile.assistedAttempts}
            total={totalAttempts}
          />
        </section>

        <section aria-labelledby="athar-states">
          <h2 id="athar-states">Where their memory stands</h2>
          <dl>
            {Object.entries(profile.states).map(([state, count]) => (
              <div key={state}>
                <dt>{state.replace(/_/g, " ")}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="athar-corrections">
          <h2 id="athar-corrections">Recurring corrections</h2>
          {profile.recurringCorrections.length === 0 ? (
            <p>No correction has recurred.</p>
          ) : (
            <ul>
              {profile.recurringCorrections.map((c) => (
                <li key={c.category}>
                  {c.category.replace(/_/g, " ")}: {c.count} times
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="athar-time">
          <h2 id="athar-time">Time</h2>
          {/*
            Active minutes are not yet instrumented, so they are reported
            as not recorded rather than estimated from wall-clock time.
          */}
          <HonestMetric label="Active practice this week" missing="notRecorded" />
          <p>
            Days without recorded practice this week: {profile.inactiveDays} of 7
          </p>
          <p>Reviews due now: {profile.dueReviews}</p>
        </section>
      </main>
    </LocaleProvider>
  );
}
