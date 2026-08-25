"use client";

import Link from "next/link";
import { EmptyState } from "../../design/ui/display";
import { LinkButton } from "../../design/ui/controls";
import { useSurface } from "../../design/theme/ThemeProvider";
import styles from "../../classroom/ui/TeacherConsole.module.css";

export type VerifyQueueRow = {
  readonly id: string;
  readonly learnerName: string;
  readonly hours: number;
  readonly sura: number | null;
  readonly ayahFrom: number | null;
  readonly ayahTo: number | null;
};

/**
 * The waiting list. It is a list of people, not of tasks: the name comes first,
 * the passage second, and the wait is stated plainly because it is the reason
 * the order is what it is.
 */
export function VerifyQueue({ rows }: { readonly rows: readonly VerifyQueueRow[] }) {
  const { t } = useSurface();

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{t("teacher.verify.title")}</p>
          <h1 className={styles.title}>{t("teacher.verify.heading")}</h1>
        </div>
        <p className={styles.meta}>{t("teacher.verify.queue", { count: rows.length })}</p>
      </header>

      <section className={styles.card}>
        {rows.length === 0 ? (
          <EmptyState title={t("teacher.verify.empty")} description={t("teacher.verify.emptyBody")} />
        ) : (
          <ol className={styles.list}>
            {rows.map((row, index) => (
              <li key={row.id} className={styles.row}>
                <span className={styles.rank} aria-hidden="true">
                  {index + 1}
                </span>
                <div className={styles.rowBody}>
                  <p className={styles.name}>{row.learnerName}</p>
                  <p className={styles.reason}>
                    {row.sura === null
                      ? t("state.notYetRecorded")
                      : t("teacher.verify.scope", {
                          sura: row.sura,
                          from: row.ayahFrom ?? 0,
                          to: row.ayahTo ?? 0,
                        })}
                  </p>
                  <p className={styles.also}>{t("teacher.verify.requestedAt", { hours: row.hours })}</p>
                </div>
                <LinkButton
                  as={Link}
                  href={`/teacher/verify/${row.id}`}
                  variant={index === 0 ? "primary" : "secondary"}
                  size="sm"
                >
                  {t("teacher.verify.open")}
                </LinkButton>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
