"use client";

import { Badge } from "../../design/ui/display";
import { useSurface } from "../../design/theme/ThemeProvider";
import type { OnboardingProgress } from "../domain/onboarding";
import styles from "./TeacherConsole.module.css";

/**
 * The onboarding checklist.
 *
 * There is no progress bar here, deliberately. A bar invites a percentage, a
 * percentage invites rounding, and "80% set up" says less than "four of five
 * done, and the fifth is: make the first assignment". Each row carries the
 * real count behind it, and the whole thing disappears once it is finished.
 */
export type OnboardingChecklistProps = {
  readonly progress: OnboardingProgress;
};

const TONE = {
  done: "success",
  current: "accent",
  waiting: "caution",
  blocked: "neutral",
} as const;

export function OnboardingChecklist({ progress }: OnboardingChecklistProps) {
  const { t } = useSurface();
  if (progress.complete) return null;

  return (
    <section className={styles.card} aria-labelledby="onboarding-heading">
      <h2 className={styles.sectionTitle} id="onboarding-heading">
        {t("teacher.onboarding.heading")}
      </h2>
      <p className={styles.sectionNote}>
        {t("teacher.onboarding.progress", { done: progress.done, total: progress.total })}
      </p>
      <ul className={styles.checklist}>
        {progress.steps.map((step) => (
          <li key={step.id} className={styles.checkRow} data-state={step.state}>
            <Badge tone={TONE[step.state]} dot>
              {t(`teacher.onboarding.state.${step.state}`)}
            </Badge>
            <span className={styles.checkLabel}>
              {t(`teacher.onboarding.step.${step.id}`)}
              {step.count === null || step.count === 0 ? null : (
                <> · {t(`teacher.onboarding.count.${step.id}`, { count: step.count })}</>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
