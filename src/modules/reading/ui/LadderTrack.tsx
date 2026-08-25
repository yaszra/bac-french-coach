import type { Translate } from "@/modules/platform/i18n/translate";

import { LADDER_RUNGS, explainRung, type LadderState } from "../domain/masteryLadder";
import type { SmartScore } from "../domain/smartscore";
import styles from "./reading.module.css";

/**
 * The three rungs, and which one is being worked on.
 *
 * The final rung is where this product either keeps its word or breaks it, so the
 * copy is generated from `verificationLabelKey` — a key the ladder engine chooses, and
 * which has three distinct values. A self-confirmation renders as a self-confirmation,
 * always, with a note saying whose word it is. There is no branch that can print a
 * teacher's confirmation over a learner's own.
 */
export function LadderTrack({
  ladder,
  t,
}: {
  readonly ladder: LadderState;
  readonly t: Translate;
}) {
  return (
    <div className={styles.panel} data-testid="reading-ladder">
      <p className={styles.panelTitle}>{t("reading.ladder.heading")}</p>
      <div className={styles.rungs}>
        {LADDER_RUNGS.map((rung) => {
          const progress = ladder.rungs[rung];
          const explanation = explainRung(rung);
          return (
            <div
              key={rung}
              className={styles.rung}
              data-working={ladder.workingOn === rung}
              data-met={progress.met}
            >
              <div>
                <p className={styles.rungTitle}>{t(explanation.titleKey)}</p>
                <p className={styles.rungBody}>{t(explanation.bodyKey)}</p>
                <p className={styles.rungBody}>
                  {progress.attempts === 0
                    ? t("reading.ladder.noAttempts")
                    : t("reading.ladder.progress", {
                        correct: progress.correct,
                        attempts: progress.attempts,
                        sessions: progress.sessions,
                      })}
                </p>
              </div>
              <span className={styles.quiet}>
                {t(progress.met ? "reading.ladder.met" : "reading.ladder.notMet")}
              </span>
            </div>
          );
        })}
      </div>

      <p className={styles.note} data-testid="reading-verification">
        {t(ladder.verificationLabelKey)}
      </p>
      {ladder.selfConfirmed ? (
        <p className={styles.quiet} data-testid="reading-self-confirmed">
          {t("reading.ladder.selfConfirmedNote")}
        </p>
      ) : null}
      {!ladder.teacherVerified && ladder.workingOn === "in_person" ? (
        <p className={styles.quiet}>{t("reading.ladder.awaitingTeacher")}</p>
      ) : null}
    </div>
  );
}

/**
 * One concept's SmartScore, with its denominator attached.
 *
 * `score` is `null` when nothing mastery-bearing has been recorded, and this renders
 * that as "not yet recorded" — never as 0%, which would claim a measurement that was
 * never taken (honesty rule).
 */
export function ScoreLine({
  score,
  t,
  showNumber,
}: {
  readonly score: SmartScore;
  readonly t: Translate;
  /** Children are never shown a number. Tier policy, not decoration. */
  readonly showNumber: boolean;
}) {
  // Two counts, so two plural forms: "1 answer" and "3 sittings" each pick their own,
  // which one string with two numbers in it could never do correctly.
  const denominator = t("reading.smartscore.denominator", {
    answers: t("reading.smartscore.answers", { count: score.denominator.attempts }),
    sittings: t("reading.smartscore.sittings", { count: score.denominator.sessions }),
  });

  return (
    <span className={styles.row} data-testid="reading-score" data-state={score.state}>
      <span>{t(`reading.smartscore.state.${score.state}`)}</span>
      {score.state === "not_yet_recorded" ? (
        <span className={styles.quiet}>{t("reading.smartscore.noEvidence")}</span>
      ) : (
        <>
          {showNumber && score.score !== null ? (
            <span className={styles.letterMeta}>{score.score}</span>
          ) : null}
          <span className={styles.quiet}>{denominator}</span>
        </>
      )}
    </span>
  );
}
