"use client";

/* Takes an action callback from the route. */

/**
 * Learner Today.
 *
 * The vertical order is fixed (docs/03) and there is exactly one primary
 * action. Everything else is secondary by construction, not by styling:
 * a screen where three buttons look equally important asks the learner to
 * make a planning decision they came here to avoid.
 */
import type { RankedCandidate, TodayPlan } from "../../core/recommend.js";
import { useLocale } from "../i18n/context.js";
import { LearningStateBadge } from "./LearningStateBadge.js";
import { EmptyState } from "./RouteStates.js";

export interface LearnerTodayProps {
  plan: TodayPlan;
  effortTargetMinutes: number;
  onStart: (targetId: string) => void;
}

function Card({
  item,
  actionLabel,
  primary,
  onStart,
}: {
  item: RankedCandidate;
  actionLabel: string;
  primary: boolean;
  onStart: (targetId: string) => void;
}) {
  const { t } = useLocale();
  return (
    <article
      className="athar-card"
      data-primary={primary}
      data-target={item.candidate.targetId}
    >
      <h3 className="athar-card__title">{item.candidate.label}</h3>
      <LearningStateBadge state={item.candidate.state} />
      <p className="athar-card__minutes">
        {t("today.activeMinutes", {
          minutes: item.candidate.estimatedActiveMinutes,
        })}
      </p>
      {/* The reason is not optional decoration: it is why this is on screen. */}
      <p className="athar-card__reason">{item.reason}</p>
      <button
        type="button"
        className="athar-card__action"
        data-variant={primary ? "primary" : "secondary"}
        onClick={() => onStart(item.candidate.targetId)}
      >
        {actionLabel}
      </button>
    </article>
  );
}

export function LearnerToday({
  plan,
  effortTargetMinutes,
  onStart,
}: LearnerTodayProps) {
  const { t } = useLocale();
  const hasAnything =
    plan.continueNow !== undefined ||
    plan.newMemory !== undefined ||
    plan.keepStrong.length > 0;

  if (!hasAnything)
    return (
      <main className="athar-today">
        <h1>{t("today.heading")}</h1>
        {/* A quiet day is reported as a quiet day, not as a failure. */}
        <EmptyState heading={t("today.nothingDue")} />
      </main>
    );

  return (
    <main className="athar-today">
      <h1>{t("today.heading")}</h1>

      {plan.continueNow ? (
        <section aria-labelledby="athar-continue">
          <h2 id="athar-continue">{t("today.continueNow")}</h2>
          <Card
            item={plan.continueNow}
            actionLabel={t("today.continue")}
            primary
            onStart={onStart}
          />
        </section>
      ) : null}

      {plan.newMemory ? (
        <section aria-labelledby="athar-new">
          <h2 id="athar-new">{t("today.newMemory")}</h2>
          <Card
            item={plan.newMemory}
            actionLabel={t("today.start")}
            primary={plan.continueNow === undefined}
            onStart={onStart}
          />
        </section>
      ) : null}

      {plan.keepStrong.length > 0 ? (
        <section aria-labelledby="athar-keep">
          <h2 id="athar-keep">{t("today.keepStrong")}</h2>
          {plan.keepStrong.map((item) => (
            <Card
              key={item.candidate.targetId}
              item={item}
              actionLabel={t("today.review")}
              primary={false}
              onStart={onStart}
            />
          ))}
        </section>
      ) : null}

      {/*
        Deferred work is stated on the page, in the learner's own view.
        Hiding it would make a capped queue look like a completed one.
      */}
      {plan.cappedNotice ? (
        <p className="athar-today__capped" role="status">
          {plan.cappedNotice}
        </p>
      ) : null}

      {/* An effort target, never a screen-time target. */}
      <p className="athar-today__effort">
        {t("today.effortTarget")}:{" "}
        {t("today.activeMinutes", { minutes: effortTargetMinutes })}
      </p>
    </main>
  );
}
