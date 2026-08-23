"use client";

import { useState, useTransition } from "react";
import { useSurface } from "../../design/theme/ThemeProvider";
import { Button } from "../../design/ui/controls";
import { Badge, EmptyState } from "../../design/ui/display";
import { recallLine, type Tonight } from "../domain/tonight";
import { approverLabelKey } from "../domain/claim";
import { completeHomeTask } from "../actions/family-actions";
import styles from "./family.module.css";

/**
 * Tonight, as a parent reads it.
 *
 * The screen is a short sequence of sentences: what happened, one thing to do,
 * and one thing to do together. Every number that appears carries what it was
 * counted from, and a number we do not have is absent rather than zero.
 */
export function TonightView({
  tonight,
  reportState,
}: {
  readonly tonight: Tonight;
  readonly reportState: "ready" | "not_built" | "failed";
}) {
  const { t } = useSurface();

  if (reportState !== "ready") {
    return (
      <EmptyState
        variant="not-yet-recorded"
        title={t(reportState === "failed" ? "family.tonight.reportFailed" : "family.tonight.noReport")}
        description={t(
          reportState === "failed" ? "family.tonight.reportFailedHelp" : "family.tonight.noReportHelp",
        )}
      />
    );
  }

  const recall = recallLine(tonight.unassistedRecall);

  return (
    <div className={styles.stack}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>{tonight.forDate}</p>
        <h2 className={styles.headline}>
          {tonight.state === "quiet"
            ? t("family.tonight.quietDay", { child: tonight.childName })
            : t("family.tonight.headline", {
                child: tonight.childName,
                minutes: tonight.minutesPractised,
              })}
        </h2>

        {tonight.state === "quiet" ? (
          <p className={styles.quiet}>{t("family.tonight.quietDayHelp")}</p>
        ) : (
          <>
            <p className={styles.sentence}>
              {/* "8 of 0" is not a sentence. With nothing due, we say what was
                  actually done and claim no proportion at all. */}
              {tonight.reviews.due > 0
                ? t("family.tonight.reviews", { done: tonight.reviews.done, due: tonight.reviews.due })
                : t("family.tonight.reviewsDoneOnly", { done: tonight.reviews.done })}
            </p>
            <p className={styles.sentence}>
              {recall.kind === "measured"
                ? t("family.tonight.recall", {
                    numerator: recall.numerator,
                    denominator: recall.denominator,
                    percent: recall.percent,
                  })
                : t("family.tonight.recallNotYet", { needed: recall.needed })}
            </p>
          </>
        )}
      </section>

      <section className={styles.card}>
        <p className={styles.eyebrow}>{t("progress.held")}</p>
        <p className={styles.figure}>{tonight.trend.wordsHeld}</p>
        <p className={styles.sentence}>{trendSentence(tonight, t)}</p>
      </section>

      {tonight.actions.length === 0 ? null : (
        <section className={styles.card}>
          <p className={styles.eyebrow}>{t("family.tonight.oneThing")}</p>
          <ul className={styles.list}>
            {tonight.actions.map((action) => (
              <li key={action.unitId} className={styles.listItem}>
                <span className={styles.sentence}>{t(action.reasonKey)}</span>
                <strong>{t(action.actionKey)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      <HomeTaskCard tonight={tonight} />

      {tonight.approvals.length === 0 ? null : (
        <section className={styles.card}>
          <ul className={styles.tickList}>
            {tonight.approvals.map((approval, index) => (
              <li key={`${approval.approvedByName}-${index}`}>
                {t("family.tonight.approvedBy", {
                  count: approval.unitCount,
                  name: approval.approvedByName,
                  role: t(approverLabelKey(approval.approverRole)),
                })}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function trendSentence(tonight: Tonight, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (tonight.trend.kind === "no_comparison") {
    return t("family.tonight.wordsHeldNoComparison", { count: tonight.trend.wordsHeld });
  }
  const key =
    tonight.trend.direction === "more"
      ? "family.tonight.wordsHeldMore"
      : tonight.trend.direction === "fewer"
        ? "family.tonight.wordsHeldFewer"
        : "family.tonight.wordsHeldSame";
  return t(key, {
    count: tonight.trend.wordsHeld,
    delta: Math.abs(tonight.trend.deltaWords),
  });
}

/**
 * The one thing to do together. Completing it records that a family did it —
 * and says, on the card itself, that it is not progress. The evidence rule is
 * not a footnote in the documentation; it is a line on the screen.
 */
function HomeTaskCard({ tonight }: { readonly tonight: Tonight }) {
  const { t } = useSurface();
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>{t("family.task.heading")}</p>
      <h3 className={styles.headline}>{t(tonight.homeTask.labelKey)}</h3>
      <p className={styles.sentence}>{t(tonight.homeTask.descriptionKey)}</p>
      <div className={styles.rowBetween}>
        <Badge tone="neutral">{t("family.task.minutes", { minutes: tonight.homeTask.minutes })}</Badge>
        {tonight.homeTask.needsAdult ? <Badge tone="accent">{t("family.task.withAdult")}</Badge> : null}
      </div>
      <div className={styles.actions}>
        {done ? (
          <Badge tone="success" dot>
            {t("family.task.recorded")}
          </Badge>
        ) : (
          <Button
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await completeHomeTask({
                  learnerUserId: tonight.learnerUserId,
                  taskId: tonight.homeTask.id,
                });
                if (result.ok) setDone(true);
              })
            }
          >
            {t("family.task.done")}
          </Button>
        )}
      </div>
      <p className={styles.note}>{t("family.task.notEvidence")}</p>
    </section>
  );
}
