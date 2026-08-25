import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { TeacherSignInForm } from "@/modules/classroom/ui/TeacherSignInForm";
import styles from "@/modules/classroom/ui/TeacherConsole.module.css";

export default async function TeacherSignInPage() {
  const caller = await getCaller();
  if (caller.kind === "authenticated") redirect("/teacher/today");

  return (
    <main className={styles.page}>
      <TeacherSignInForm />
    </main>
  );
}
