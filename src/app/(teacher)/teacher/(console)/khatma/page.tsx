import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { listClassrooms, listLearners } from "@/modules/classroom/repo/teacher-repo";
import { khatmaFlags } from "@/modules/assessment/repo/verification-repo";
import { KhatmaConsole } from "@/modules/classroom/ui/KhatmaConsole";
import { KhatmaHeading } from "@/modules/classroom/ui/KhatmaHeading";
import styles from "@/modules/classroom/ui/TeacherConsole.module.css";

export default async function KhatmaPage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/teacher/sign-in");
  const actor = caller.actor;

  const classrooms = await listClassrooms(actor.organizationId, actor.userId);
  const classroom = classrooms[0] ?? null;
  const learners = classroom === null ? [] : await listLearners(actor.organizationId, classroom.id);
  const nameOf = new Map(learners.map((learner) => [learner.userId, learner.displayName]));
  const flags = await khatmaFlags(
    actor.organizationId,
    learners.map((learner) => learner.userId),
  );

  return (
    <main className={styles.page}>
      <KhatmaHeading />
      <KhatmaConsole
        learners={learners.map((learner) => ({
          userId: learner.userId,
          displayName: learner.displayName,
        }))}
        flags={flags.map((flag) => ({
          id: flag.id,
          learnerUserId: flag.learnerUserId,
          learnerName: nameOf.get(flag.learnerUserId) ?? flag.learnerUserId,
          sura: flag.position.sura,
          ayah: flag.position.ayah,
          wordIndex: flag.position.wordIndex ?? null,
          category: flag.category,
          note: flag.note,
          createdAt: flag.createdAt.toISOString(),
          resolvedAt: flag.resolvedAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
