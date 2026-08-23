"use client";

import Link from "next/link";
import { EmptyState } from "../../design/ui/display";
import { useSurface } from "../../design/theme/ThemeProvider";
import styles from "./TeacherConsole.module.css";

/** The class list. Names, in the order a register would have them. */
export function RosterView({
  joinCode,
  learners,
}: {
  readonly joinCode: string | null;
  readonly learners: readonly { readonly userId: string; readonly displayName: string }[];
}) {
  const { t } = useSurface();

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{t("teacher.students.title")}</p>
          <h1 className={styles.title}>{t("teacher.students.heading")}</h1>
        </div>
        {joinCode === null ? null : (
          <p className={styles.meta}>{t("teacher.students.joinCode", { code: joinCode })}</p>
        )}
      </header>

      <section className={styles.card}>
        {learners.length === 0 ? (
          <EmptyState title={t("teacher.students.empty")} description={t("teacher.students.emptyBody")} />
        ) : (
          <ul className={styles.list}>
            {learners.map((learner) => (
              <li key={learner.userId} className={styles.row}>
                <span className={styles.rank} aria-hidden="true" />
                <div className={styles.rowBody}>
                  <p className={styles.name}>
                    <Link href={`/teacher/students/${learner.userId}`}>{learner.displayName}</Link>
                  </p>
                </div>
                <span />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
