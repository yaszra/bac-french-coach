"use client";

import { useSurface } from "../../design/theme/ThemeProvider";
import styles from "./TeacherConsole.module.css";

export function AssignHeading() {
  const { t } = useSurface();
  return (
    <header className={styles.pageHeader}>
      <div>
        <p className={styles.eyebrow}>{t("teacher.assign.title")}</p>
        <h1 className={styles.title}>{t("teacher.assign.heading")}</h1>
      </div>
    </header>
  );
}
