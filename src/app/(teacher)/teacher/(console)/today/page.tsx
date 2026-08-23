import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import {
  listClassrooms,
  listLearners,
  onboardingFacts,
  triageSignalsFor,
} from "@/modules/classroom/repo/teacher-repo";
import { rankTriage } from "@/modules/classroom/domain/triage";
import { onboardingProgress } from "@/modules/classroom/domain/onboarding";
import { TriageInboxView, type TriageRowView } from "@/modules/classroom/ui/TriageInboxView";
import { OnboardingChecklist } from "@/modules/classroom/ui/OnboardingChecklist";
import { PresencePanel } from "@/modules/classroom/ui/PresencePanel";
import { TriageHeading } from "@/modules/classroom/ui/TriageHeading";
import styles from "@/modules/classroom/ui/TeacherConsole.module.css";

/**
 * The triage inbox.
 *
 * A server component: it reads facts, hands them to a pure ranker, and renders
 * the result. The ranking itself lives in `classroom/domain/triage.ts` and is
 * tested without a database — this page contains no thresholds, no weights and
 * no opinion about who matters.
 */
export default async function TriagePage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/teacher/sign-in");
  const actor = caller.actor;
  const now = new Date();

  const classrooms = await listClassrooms(actor.organizationId, actor.userId);
  const classroom = classrooms[0] ?? null;
  const learners = classroom === null ? [] : await listLearners(actor.organizationId, classroom.id);
  const signals = await triageSignalsFor(
    actor.organizationId,
    learners.map((learner) => learner.userId),
    now,
  );
  const inbox = rankTriage(signals, now);
  const progress = onboardingProgress(await onboardingFacts(actor.organizationId, actor.userId));

  const nameOf = new Map(learners.map((learner) => [learner.userId, learner.displayName]));

  /* The action a row leads with follows its reason: someone waiting to be heard
     is answered by listening, a guardian's claim by looking at the claim, and
     everything else by opening the student. */
  const rows: readonly TriageRowView[] = inbox.items.map((item) => {
    const kind = item.leadReason.kind;
    const actionKey =
      kind === "verification_waiting"
        ? ("listen" as const)
        : kind === "guardian_claim_waiting"
          ? ("approveClaim" as const)
          : ("openStudent" as const);
    return {
      learnerUserId: item.learnerUserId,
      displayName: nameOf.get(item.learnerUserId) ?? item.learnerUserId,
      leadReason: { kind, params: item.leadReason.params },
      otherReasons: item.reasons.slice(1).map((reason) => ({
        kind: reason.kind,
        params: reason.params,
      })),
      actionHref:
        actionKey === "listen"
          ? "/teacher/verify"
          : `/teacher/students/${item.learnerUserId}`,
      actionKey,
    };
  });

  /* "Nobody needs you" and "nothing has been measured" are different claims. */
  const nothingRecorded =
    learners.length > 0 &&
    signals.every(
      (signal) =>
        signal.trackedUnits === 0 &&
        signal.lastActivityAt === null &&
        signal.pendingVerificationSince === null &&
        signal.guardianClaimSince === null,
    );

  return (
    <main className={styles.page}>
      <TriageHeading considered={inbox.considered} />

      <div className={styles.grid}>
        <section className={styles.card} aria-label="triage">
          <TriageInboxView
            rows={rows}
            considered={inbox.considered}
            moreCount={inbox.moreCount}
            nothingRecorded={nothingRecorded}
          />
        </section>

        <div className={styles.stack}>
          <OnboardingChecklist progress={progress} />
          {classroom === null ? null : (
            <PresencePanel
              classroomId={classroom.id}
              roster={learners.map((learner) => ({
                userId: learner.userId,
                displayName: learner.displayName,
              }))}
            />
          )}
        </div>
      </div>
    </main>
  );
}
