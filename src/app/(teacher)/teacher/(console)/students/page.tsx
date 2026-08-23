import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { listClassrooms, listLearners } from "@/modules/classroom/repo/teacher-repo";
import { RosterView } from "@/modules/classroom/ui/RosterView";
import styles from "@/modules/classroom/ui/TeacherConsole.module.css";

export default async function StudentsPage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/teacher/sign-in");
  const actor = caller.actor;

  const classrooms = await listClassrooms(actor.organizationId, actor.userId);
  const classroom = classrooms[0] ?? null;
  const learners = classroom === null ? [] : await listLearners(actor.organizationId, classroom.id);

  return (
    <main className={styles.page}>
      <RosterView
        joinCode={classroom?.joinCode ?? null}
        learners={learners.map((learner) => ({
          userId: learner.userId,
          displayName: learner.displayName,
        }))}
      />
    </main>
  );
}
