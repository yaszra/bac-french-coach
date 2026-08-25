"use client";

import { useSurface } from "../../design/theme/ThemeProvider";
import { Badge, EmptyState } from "../../design/ui/display";
import { conceptLabel } from "../../reading/ui/concept-label";
import styles from "./TeacherConsole.module.css";

export type AnomalyRow = {
  readonly kind: string;
  readonly conceptId: string;
  readonly severity: "notice" | "attention";
  readonly reasonKey: string;
  readonly reasonParams: Readonly<Record<string, string | number>>;
  readonly attempts: number;
  readonly sessions: number;
};

export type LearnerAnomalyRows = {
  readonly learnerUserId: string;
  readonly displayName: string;
  readonly anomalies: readonly AnomalyRow[];
};

/**
 * Patterns worth a teacher's attention, from recorded reading evidence.
 *
 * The engine behind this has always existed and was read by nothing, so a
 * teacher was never told. Two rules it keeps, and this screen keeps with it:
 * a finding describes the OBSERVATION, never the learner — "answers arrived
 * faster than the prompt can be read", not an accusation — and every finding
 * carries the evidence it was counted from, so a pattern seen in six attempts
 * is never dressed up as a finding about a term's work.
 *
 * Nothing here changes a score or costs a learner anything. The only action an
 * anomaly recommends is a person looking.
 */
export function ReadingAnomalies({ learners }: { readonly learners: readonly LearnerAnomalyRows[] }) {
  const { t } = useSurface();

  if (learners.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title={t("reading.anomaly.none")}
        description={t("reading.anomaly.noneHelp")}
      />
    );
  }

  return (
    <section className={styles.card} data-testid="reading-anomalies">
      <h2 className={styles.sectionTitle}>{t("reading.anomaly.title")}</h2>
      <p className={styles.meta}>{t("reading.anomaly.help")}</p>

      {learners.map((learner) => (
        <div key={learner.learnerUserId} className={styles.anomalyLearner}>
          <h3 className={styles.anomalyName}>{learner.displayName}</h3>
          <ul className={styles.list}>
            {learner.anomalies.map((anomaly) => (
              <li key={`${anomaly.kind}:${anomaly.conceptId}`} className={styles.anomalyItem}>
                <div className={styles.anomalyHead}>
                  <span>{t(`reading.anomaly.kind.${anomaly.kind}`)}</span>
                  <Badge tone={anomaly.severity === "attention" ? "accent" : "neutral"}>
                    {t(`reading.anomaly.severity.${anomaly.severity}`)}
                  </Badge>
                </div>
                <p className={styles.meta}>{conceptLabel(t, anomaly.conceptId)}</p>
                <p className={styles.meta}>{t(anomaly.reasonKey, anomaly.reasonParams)}</p>
                {/* The denominator, always. A finding without one is a
                    rumour. Two counts, so two plural-bearing strings composed:
                    the plural mechanism keys on one `count`, and "1 sittings"
                    is the kind of small wrongness that makes a careful screen
                    look careless. */}
                <p className={styles.meta}>
                  {`${t("reading.anomaly.fromAttempts", { count: anomaly.attempts })} ${t(
                    "reading.anomaly.acrossSessions",
                    { count: anomaly.sessions },
                  )}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
