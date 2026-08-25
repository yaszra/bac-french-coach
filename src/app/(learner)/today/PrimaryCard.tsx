import { LinkButton } from "@/modules/design/ui/controls";
import { Badge } from "@/modules/design/ui/display";
import type { Translate } from "@/modules/platform/i18n/translate";
import type { PrimaryAction } from "@/modules/hifz/ui/plan-shape";
import { actionMessageKey, exerciseMessageKey, reasonCopy } from "@/modules/hifz/ui/reason-copy";
import { unitReferenceLabel } from "@/modules/hifz/ui/passage";
import { practiceHref } from "../practice/href";
import styles from "./today.module.css";

/**
 * The one obvious next action.
 *
 * It carries four things and no more: what to do, which āyah, why it is this one,
 * and a single button. The "why" is the engine's own reason, mapped into the
 * learner's register — not a rewritten sentence that could drift from the reason
 * the scheduler actually had.
 */
export function PrimaryCard({
  primary,
  remainingSteps,
  t,
}: {
  readonly primary: PrimaryAction;
  readonly remainingSteps: number;
  readonly t: Translate;
}) {
  const why = reasonCopy(primary.reason);
  const reference = unitReferenceLabel(primary.unitId);

  return (
    <section className={styles.primary} aria-label={t("learner.a11y.primaryAction")}>
      <p className={styles.primaryLabel}>{t("learner.today.nowDo")}</p>
      <h2 className={styles.primaryTitle}>{t(actionMessageKey(primary.action))}</h2>

      <p className={styles.primaryMeta}>
        {reference === null ? null : <Badge tone="neutral">{reference}</Badge>}
        <span>{t(exerciseMessageKey(primary.exercise))}</span>
        <span aria-hidden="true">·</span>
        <span>{t("learner.today.minutes", { count: Math.round(primary.estimatedMinutes) })}</span>
      </p>

      <p className={styles.why}>{t(why.key, why.params)}</p>

      <LinkButton href={practiceHref({ unitId: primary.unitId })} variant="primary" size="lg" data-testid="today-start">
        {t("learner.today.startExercise", { exercise: t(exerciseMessageKey(primary.exercise)) })}
      </LinkButton>

      <p className={styles.after}>
        {remainingSteps === 0
          ? t("learner.today.noneAfter")
          : t("learner.today.thenSteps", { count: remainingSteps })}
      </p>
    </section>
  );
}
