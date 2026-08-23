import { redirect } from "next/navigation";

/** The console opens on triage: the first question is always "who needs me". */
export default function TeacherIndexPage() {
  redirect("/teacher/today");
}
