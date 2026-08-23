import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { listClassrooms, listLearners } from "@/modules/classroom/repo/teacher-repo";
import { AssignWizard } from "@/modules/classroom/ui/AssignWizard";
import { AssignHeading } from "@/modules/classroom/ui/AssignHeading";
import styles from "@/modules/classroom/ui/TeacherConsole.module.css";

/** The exercise ladder, from the ḥifẓ domain. Ids only — labels come from keys. */
const EXERCISES = [
  "listen",
  "recall_first",
  "rebuild",
  "gap_fill",
  "next_ayah_cue",
  "connect_chain",
] as const;

const RECITERS = ["husary", "minshawi", "abdulbasit"] as const;

export default async function AssignPage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/teacher/sign-in");
  const actor = caller.actor;

  const classrooms = await listClassrooms(actor.organizationId, actor.userId);
  const classroom = classrooms[0] ?? null;
  const learners = classroom === null ? [] : await listLearners(actor.organizationId, classroom.id);

  return (
    <main className={styles.page}>
      <AssignHeading />
      {classroom === null ? null : (
        <AssignWizard
          classroomId={classroom.id}
          learners={learners.map((learner) => ({
            userId: learner.userId,
            displayName: learner.displayName,
          }))}
          reciters={RECITERS}
          exercises={EXERCISES}
        />
      )}
    </main>
  );
}
