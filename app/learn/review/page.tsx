/**
 * /learn/review — review, from blank.
 *
 * Reuses Today's plan rather than a separate ranking: "what should I
 * review?" and "what should I do now?" are the same question asked with a
 * different filter, and two rankings would eventually disagree.
 *
 * Every item states why it is due. The queue is capped by the session
 * budget, and whatever did not fit is stated on the page — it remains due,
 * and is never marked complete.
 */
import { redirect } from "next/navigation";
import { LearnerToday } from "../../../src/ui/components/LearnerToday.js";
import { EmptyState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";
import { requireActor } from "../../../src/server/actor.js";
import { getDatabase } from "../../../src/server/db.js";
import { getToday } from "../../../src/application/commands.js";
import type { LearnerId } from "../../../src/core/types.js";
import type { TodayPlan } from "../../../src/core/recommend.js";
import { startAssignment } from "../../actions.js";

export const dynamic = "force-dynamic";

const REVIEW_BUDGET_MINUTES = 15;

export default async function ReviewPage() {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const plan = await getToday(getDatabase(), {
    actor: result.actor,
    now: Date.now(),
    learnerId: result.actor.userId as LearnerId,
    sessionBudgetMinutes: REVIEW_BUDGET_MINUTES,
  });

  // Review covers material that already has a verified baseline. New work
  // belongs on Today, not here — so `continueNow` and `newMemory` are
  // omitted rather than set to undefined, which `exactOptionalPropertyTypes`
  // correctly refuses.
  const { continueNow, newMemory: _newMemory, ...rest } = plan;
  void _newMemory;
  const promoted =
    continueNow &&
    continueNow.candidate.state !== "assigned" &&
    continueNow.candidate.state !== "preparing"
      ? [continueNow]
      : [];
  const reviewOnly: TodayPlan = {
    ...rest,
    keepStrong: [...promoted, ...plan.keepStrong],
  };

  if (reviewOnly.keepStrong.length === 0)
    return (
      <LocaleProvider locale="en">
        <main>
          <h1>Review</h1>
          {/* Nothing due is a real answer, and a good one. */}
          <EmptyState heading="Nothing is due for review today.">
            <p>
              Your reviews are scheduled from evidence, so a quiet day means
              your memory is holding — not that something was missed.
            </p>
          </EmptyState>
        </main>
      </LocaleProvider>
    );

  return (
    <LocaleProvider locale="en">
      <LearnerToday
        plan={reviewOnly}
        effortTargetMinutes={REVIEW_BUDGET_MINUTES}
        onStart={startAssignment}
      />
    </LocaleProvider>
  );
}
