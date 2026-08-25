import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { listClassrooms, listLearners } from "@/modules/classroom/repo/teacher-repo";
import { ReadingGateForm } from "@/modules/classroom/ui/ReadingGateForm";
import { ReadingAnomalies } from "@/modules/classroom/ui/ReadingAnomalies";
import { readingAnomaliesFor } from "@/modules/reading/repo/anomaly-repo";
import styles from "@/modules/classroom/ui/TeacherConsole.module.css";

/** Qāʿidah lesson ids from the content package. Ids only, never their content. */
const LESSONS = ["qaidah.l1", "qaidah.l2", "qaidah.l3", "qaidah.l4"] as const;

export default async function ReadingGatePage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/teacher/sign-in");
  const actor = caller.actor;

  const classrooms = await listClassrooms(actor.organizationId, actor.userId);
  const classroom = classrooms[0] ?? null;
  const learners = classroom === null ? [] : await listLearners(actor.organizationId, classroom.id);

  /* What the recorded evidence has to say about this class's reading. The
     engine that finds these has existed since the reading surface was built
     and nothing read it, so no teacher was ever told. */
  const anomalies = await readingAnomaliesFor(actor.organizationId, learners);

  return (
    <main className={styles.page}>
      <ReadingGateForm
        learners={learners.map((learner) => ({
          userId: learner.userId,
          displayName: learner.displayName,
        }))}
        lessons={LESSONS}
      />
      <ReadingAnomalies
        learners={anomalies.map((learner) => ({
          learnerUserId: learner.learnerUserId,
          displayName: learner.displayName,
          anomalies: learner.anomalies.map((anomaly) => ({
            kind: anomaly.kind,
            conceptId: anomaly.conceptId,
            severity: anomaly.severity,
            reasonKey: anomaly.reason.key,
            reasonParams: anomaly.reason.params,
            attempts: anomaly.denominator.attempts,
            sessions: anomaly.denominator.sessions,
          })),
        }))}
      />
    </main>
  );
}
