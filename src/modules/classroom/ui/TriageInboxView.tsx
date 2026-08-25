"use client";

import Link from "next/link";
import { EmptyState } from "../../design/ui/display";
import { LinkButton } from "../../design/ui/controls";
import { useSurface } from "../../design/theme/ThemeProvider";
import type { TriageReasonKind } from "../domain/triage";
import styles from "./TeacherConsole.module.css";

/**
 * The triage inbox.
 *
 * Every row is a name, one sentence saying why, and one obvious next action.
 * The sentence is NOT assembled here: the server sent a reason kind and its
 * parameters, and this component looks the sentence up. That is what lets the
 * same reason be rendered in Arabic, grouped in a report, or asserted on in a
 * test without three different ideas of what it says.
 */
export type TriageRowView = {
  readonly learnerUserId: string;
  readonly displayName: string;
  readonly leadReason: {
    readonly kind: TriageReasonKind;
    readonly params: Readonly<Record<string, number>>;
  };
  readonly otherReasons: readonly {
    readonly kind: TriageReasonKind;
    readonly params: Readonly<Record<string, number>>;
  }[];
  /** Where the one obvious action goes for this row's lead reason. */
  readonly actionHref: string;
  readonly actionKey: "listen" | "approveClaim" | "openStudent";
};

export type TriageInboxViewProps = {
  readonly rows: readonly TriageRowView[];
  readonly considered: number;
  readonly moreCount: number;
  /** True when the class has learners but no recorded evidence at all. */
  readonly nothingRecorded: boolean;
};

export function TriageInboxView({
  rows,
  considered,
  moreCount,
  nothingRecorded,
}: TriageInboxViewProps) {
  const { t } = useSurface();

  if (rows.length === 0) {
    /* Two different nothings, and they are not the same claim: a class with
       evidence and nobody waiting is good news; a class with no evidence at
       all has not been measured, and saying "all clear" would be a lie. */
    return nothingRecorded ? (
      <EmptyState
        variant="not-yet-recorded"
        title={t("teacher.triage.notYetRecorded")}
        description={t("teacher.triage.notYetRecordedBody")}
      />
    ) : (
      <EmptyState
        title={t("teacher.triage.empty")}
        description={t("teacher.triage.emptyBody")}
      />
    );
  }

  return (
    <>
      <p className={styles.meta}>
        {t("teacher.triage.summary", { count: rows.length, total: considered })}
      </p>
      <ol className={styles.list}>
        {rows.map((row, index) => (
          <li key={row.learnerUserId} className={styles.row}>
            <span className={styles.rank} aria-hidden="true">
              {index + 1}
            </span>
            <div className={styles.rowBody}>
              <p className={styles.name}>
                <Link href={`/teacher/students/${row.learnerUserId}`}>{row.displayName}</Link>
              </p>
              <p className={styles.reason}>
                {t(`teacher.reason.${row.leadReason.kind}`, row.leadReason.params)}
              </p>
              {row.otherReasons.length === 0 ? null : (
                <ul className={styles.alsoList}>
                  {row.otherReasons.map((reason) => (
                    <li key={reason.kind} className={styles.also}>
                      <span className={styles.alsoLabel}>{t("teacher.triage.alsoBecause")} </span>
                      {t(`teacher.reason.${reason.kind}`, reason.params)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <LinkButton
              as={Link}
              href={row.actionHref}
              variant={index === 0 ? "primary" : "secondary"}
              size="sm"
            >
              {t(`teacher.triage.${row.actionKey}`)}
            </LinkButton>
          </li>
        ))}
      </ol>
      {moreCount > 0 ? (
        <p className={styles.meta}>{t("teacher.triage.more", { count: moreCount })}</p>
      ) : null}
    </>
  );
}
