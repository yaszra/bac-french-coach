"use client";

import { useSurface } from "../../design/theme/ThemeProvider";
import styles from "./TeacherConsole.module.css";

export function NotificationsHeading() {
  const { t } = useSurface();
  return (
    <header className={styles.pageHeader}>
      <div>
        <p className={styles.eyebrow}>{t("teacher.notifications.title")}</p>
        <h1 className={styles.title}>{t("teacher.notifications.heading")}</h1>
      </div>
    </header>
  );
}
