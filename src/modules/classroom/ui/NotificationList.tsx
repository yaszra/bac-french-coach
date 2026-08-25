"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../design/ui/controls";
import { Badge, EmptyState } from "../../design/ui/display";
import { useSurface } from "../../design/theme/ThemeProvider";
import { markAllNotificationsRead, markNotificationRead } from "../actions/notifications";
import { deliveryNoteKey } from "./notification-delivery";
import styles from "./TeacherConsole.module.css";

/**
 * The in-app notification list.
 *
 * Delivery state is shown, not hidden. A message that could not be sent by
 * email says so, and says what to do instead — telling a family yourself is a
 * legitimate fallback, and pretending a notification arrived when it did not
 * is exactly the fake completeness the honesty rule forbids.
 */
export type NotificationView = {
  readonly id: string;
  readonly kind: string;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly deliveryState: string;
};

const KNOWN = new Set(["verification_requested", "guardian_claim", "assignment_completed"]);

export function NotificationList({ items }: { readonly items: readonly NotificationView[] }) {
  const { t, locale } = useSurface();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const unread = items.filter((item) => item.readAt === null).length;

  if (items.length === 0) {
    return <EmptyState description={t("teacher.notifications.empty")} />;
  }

  return (
    <>
      <div className={styles.rowActions}>
        <p className={styles.meta}>{t("teacher.notifications.unread", { count: unread })}</p>
        {unread === 0 ? null : (
          <Button
            variant="secondary"
            size="sm"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                await markAllNotificationsRead();
                router.refresh();
              })
            }
          >
            {t("teacher.notifications.markRead")}
          </Button>
        )}
      </div>
      <ul className={styles.checklist}>
        {items.map((item) => (
          <li key={item.id} className={styles.checkRow} data-state={item.readAt === null ? "current" : "done"}>
            <Badge tone={item.readAt === null ? "accent" : "neutral"} dot>
              {new Date(item.createdAt).toLocaleDateString(locale)}
            </Badge>
            <span className={styles.checkLabel}>
              {t(`teacher.notifications.kind.${KNOWN.has(item.kind) ? item.kind : "unknown"}`)}
              {deliveryNoteKey(item.deliveryState) === null
                ? ""
                : ` · ${t(deliveryNoteKey(item.deliveryState) as string)}`}
            </span>
            {item.readAt === null ? (
              <Button
                variant="quiet"
                size="sm"
                onClick={() =>
                  startTransition(async () => {
                    await markNotificationRead({ notificationId: item.id });
                    router.refresh();
                  })
                }
              >
                {t("teacher.notifications.markRead")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
