"use client";

import { useSurface } from "../../design/theme/ThemeProvider";
import { EmptyState } from "../../design/ui/display";
import { isMeasured } from "../domain/denominator";
import type { Figure, RankedRow, SchoolOverview } from "../domain/school-overview";
import styles from "./school.module.css";

/**
 * The school overview.
 *
 * Sentences and ranked lists. No chart appears here, because no decision an
 * administrator makes is improved by one: they need to know whether children
 * are being heard, whether teachers are using it, and who has been missed.
 * Every line carries its denominator and the period it covers.
 */
export function SchoolOverviewView({ overview }: { readonly overview: SchoolOverview }) {
  const { t, locale } = useSurface();
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
  const days = overview.period.days;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("school.title")}</h1>
        <p className={styles.subtitle}>
          {t("school.subtitle", { days, date: dateFormat.format(overview.period.to) })}
        </p>
      </header>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{t("school.latency.heading")}</h2>
        <p className={styles.lead}>
          {overview.latency.kind === "measured"
            ? t("school.latency.measured", {
                answered: overview.latency.answered,
                median: overview.latency.medianMinutes,
                p90: overview.latency.p90Minutes,
              })
            : t("school.latency.notYetRecorded", {
                answered: overview.latency.answered,
                needed: overview.latency.needed,
              })}
        </p>
        <p className={styles.sentence}>
          {overview.waiting.waiting === 0
            ? t("school.latency.noneWaiting")
            : t("school.latency.waiting", {
                count: overview.waiting.waiting,
                hours: overview.waiting.longestWaitHours ?? 0,
              })}
        </p>
      </section>

      <section className={styles.columns}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{t("school.figure.heading")}</h2>
          {[overview.enrolment, overview.activeLearners, overview.teacherUsage].map((figure) => (
            <p key={figure.key} className={styles.sentence}>
              <FigureSentence figure={figure} days={days} />
            </p>
          ))}
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{t("school.requests.heading")}</h2>
          <p className={styles.sentence}>{t("school.requests.line", overview.dataRequests)}</p>
          <p className={styles.note}>{t("school.privacy")}</p>
        </div>
      </section>

      <section className={styles.columns}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{t("school.coverage.heading")}</h2>
          <RankedList
            rows={overview.coverage}
            emptyKey="school.coverage.none"
            render={(row) => t("school.coverage.row", { count: row.value, denominator: row.denominator })}
            label={(row) => t("school.coverage.surah", { label: row.label })}
          />
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{t("school.intervention.heading")}</h2>
          <RankedList
            rows={overview.interventions}
            emptyKey="school.intervention.none"
            render={(row) => t("school.intervention.waitingHours", { hours: row.value })}
            label={(row) => row.label}
          />
        </div>
      </section>
    </div>
  );
}

function FigureSentence({ figure, days }: { readonly figure: Figure; readonly days: number }) {
  const { t } = useSurface();
  // A rate below the minimum is not shown as a smaller number; the sentence
  // says what is known instead, which is the count so far.
  if (!isMeasured(figure.measured)) {
    // Which figure is unmeasured matters; three identical disclaimers in a row
    // tell an administrator nothing.
    const label = t(figure.key.replace("school.figure.", "school.figure.label."));
    return <>{t("school.figure.notYetRecorded", { label, denominator: figure.denominator })}</>;
  }
  return <>{t(figure.key, { count: figure.count, denominator: figure.denominator, days })}</>;
}

function RankedList({
  rows,
  emptyKey,
  render,
  label,
}: {
  readonly rows: readonly RankedRow[];
  readonly emptyKey: string;
  readonly render: (row: RankedRow) => string;
  readonly label: (row: RankedRow) => string;
}) {
  const { t } = useSurface();
  if (rows.length === 0) return <EmptyState title={t(emptyKey)} headingLevel={3} />;
  return (
    <ol className={styles.ranked}>
      {rows.map((row) => (
        <li key={row.id} className={styles.rankedRow}>
          <span className={styles.rankedLabel}>{label(row)}</span>
          <span className={styles.rankedValue}>{render(row)}</span>
        </li>
      ))}
    </ol>
  );
}
