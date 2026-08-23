import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { listClassrooms, listLearners } from "@/modules/classroom/repo/teacher-repo";
import { ReadingGateForm } from "@/modules/classroom/ui/ReadingGateForm";
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

  return (
    <main className={styles.page}>
      <ReadingGateForm
        learners={learners.map((learner) => ({
          userId: learner.userId,
          displayName: learner.displayName,
        }))}
        lessons={LESSONS}
      />
    </main>
  );
}
