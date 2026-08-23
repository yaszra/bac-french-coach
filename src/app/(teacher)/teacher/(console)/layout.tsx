import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCaller } from "@/modules/identity/actions/session-context";
import { listClassrooms, listLearners } from "@/modules/classroom/repo/teacher-repo";
import { pendingVerifications } from "@/modules/assessment/repo/verification-repo";
import { TeacherConsoleShell } from "@/modules/classroom/ui/TeacherConsoleShell";

/**
 * Everything behind the sign-in wall.
 *
 * The class in front of the teacher and the size of the verification queue are
 * resolved once, here, because every page in the console shows them and none of
 * them should each go and ask the database for itself.
 */
export default async function ConsoleLayout({ children }: { readonly children: ReactNode }) {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/teacher/sign-in");
  const actor = caller.actor;

  const classrooms = await listClassrooms(actor.organizationId, actor.userId);
  const classroom = classrooms[0] ?? null;
  const learners =
    classroom === null ? [] : await listLearners(actor.organizationId, classroom.id);
  const waiting =
    learners.length === 0
      ? []
      : await pendingVerifications(
          actor.organizationId,
          learners.map((learner) => learner.userId),
        );

  return (
    <TeacherConsoleShell
      className={classroom?.name ?? null}
      learnerCount={learners.length}
      waitingCount={waiting.length}
    >
      {children}
    </TeacherConsoleShell>
  );
}
