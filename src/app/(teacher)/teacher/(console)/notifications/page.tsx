import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { listNotifications } from "@/modules/classroom/repo/teacher-repo";
import { NotificationList } from "@/modules/classroom/ui/NotificationList";
import { NotificationsHeading } from "@/modules/classroom/ui/NotificationsHeading";
import styles from "@/modules/classroom/ui/TeacherConsole.module.css";

export default async function NotificationsPage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/teacher/sign-in");
  const actor = caller.actor;

  const items = await listNotifications(actor.organizationId, actor.userId);

  return (
    <main className={styles.page}>
      <NotificationsHeading />
      <section className={styles.card}>
        <NotificationList
          items={items.map((item) => ({
            id: item.id,
            kind: item.kind,
            createdAt: item.createdAt.toISOString(),
            readAt: item.readAt?.toISOString() ?? null,
            deliveryState: item.deliveryState,
          }))}
        />
      </section>
    </main>
  );
}
