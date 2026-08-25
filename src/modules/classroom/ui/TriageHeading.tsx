"use client";

import { useSurface } from "../../design/theme/ThemeProvider";
import styles from "./TeacherConsole.module.css";

/** The page's own title. A client island only because it needs the translator. */
export function TriageHeading({ considered }: { readonly considered: number }) {
  const { t } = useSurface();
  return (
    <header className={styles.pageHeader}>
      <div>
        <p className={styles.eyebrow}>{t("teacher.triage.title")}</p>
        <h1 className={styles.title}>{t("teacher.triage.heading")}</h1>
      </div>
      <p className={styles.meta}>{t("teacher.triage.considered", { total: considered })}</p>
    </header>
  );
}
