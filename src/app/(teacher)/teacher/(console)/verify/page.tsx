import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { listClassrooms, listLearners } from "@/modules/classroom/repo/teacher-repo";
import { pendingVerifications } from "@/modules/assessment/repo/verification-repo";
import { parseUnitScope } from "@/modules/classroom/repo/mushaf-view";
import { VerifyQueue } from "@/modules/assessment/ui/VerifyQueue";
import styles from "@/modules/classroom/ui/TeacherConsole.module.css";

/** The queue, oldest first: the person who has waited longest is heard first. */
export default async function VerifyQueuePage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/teacher/sign-in");
  const actor = caller.actor;

  const classrooms = await listClassrooms(actor.organizationId, actor.userId);
  const classroom = classrooms[0] ?? null;
  const learners = classroom === null ? [] : await listLearners(actor.organizationId, classroom.id);
  const waiting = await pendingVerifications(
    actor.organizationId,
    learners.map((learner) => learner.userId),
  );

  const rows = waiting.map((request) => {
    const scope = parseUnitScope(request.unitScope);
    return {
      id: request.id,
      learnerName: request.learnerName,
      hours: request.waitingHours,
      sura: scope?.sura ?? null,
      ayahFrom: scope?.ayahFrom ?? null,
      ayahTo: scope?.ayahTo ?? null,
    };
  });

  return (
    <main className={styles.page}>
      <VerifyQueue rows={rows} />
    </main>
  );
}
