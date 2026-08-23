/**
 * /learn/today — the learner's orchestration screen.
 *
 * Ships all seven required states (docs/02): loading is handled by the
 * sibling `loading.tsx`, and the rest are branches here.
 */
import { redirect } from "next/navigation";
import { LearnerToday } from "../../../src/ui/components/LearnerToday.js";
import { PermissionDeniedState, RecoverableErrorState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";
import { getDatabase } from "../../../src/server/db.js";
import { requireActor } from "../../../src/server/actor.js";
import { getToday } from "../../../src/application/commands.js";
import { CommandError } from "../../../src/application/commands.js";
import type { LearnerId } from "../../../src/core/types.js";
import { startAssignment } from "../../actions.js";

export const dynamic = "force-dynamic";

const SESSION_BUDGET_MINUTES = 20;

export default async function LearnerTodayPage() {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const { actor } = result;
  try {
    const plan = await getToday(getDatabase(), {
      actor,
      now: Date.now(),
      learnerId: actor.userId as LearnerId,
      sessionBudgetMinutes: SESSION_BUDGET_MINUTES,
    });
    return (
      <LocaleProvider locale="en">
        <LearnerToday
          plan={plan}
          effortTargetMinutes={SESSION_BUDGET_MINUTES}
          onStart={startAssignment}
        />
      </LocaleProvider>
    );
  } catch (error) {
    if (error instanceof CommandError && error.code === "forbidden")
      return (
        <LocaleProvider locale="en">
          <PermissionDeniedState />
        </LocaleProvider>
      );
    // A recoverable error keeps the learner's place rather than dumping
    // them back to a blank screen.
    return (
      <LocaleProvider locale="en">
        <RecoverableErrorState onRetry={startAssignment.bind(null, "")} />
      </LocaleProvider>
    );
  }
}
