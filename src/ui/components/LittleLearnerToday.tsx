"use client";

/* Takes action callbacks from the route. */

/**
 * Today, for a little learner.
 *
 * Three destinations exist for this age: Today, My Page, Grown-up. This
 * screen shows one action at a time, in a very large control, with no
 * settings anywhere. When a decision or a setting is needed, the child is
 * handed to an adult explicitly rather than shown a form they cannot
 * reasonably complete.
 *
 * It is the same engine and the same evidence rules as every other
 * learner — only the presentation differs.
 */
import type { RankedCandidate } from "../../core/recommend.js";
import { useLocale } from "../i18n/context.js";

export interface LittleLearnerTodayProps {
  /** The single thing to do now, or nothing. */
  next?: RankedCandidate;
  /** Milestones revealed so far. Private to this child. */
  revealedStars: number;
  totalStars: number;
  onStart: (targetId: string) => void;
  onAskGrownUp: () => void;
}

export function LittleLearnerToday({
  next,
  revealedStars,
  totalStars,
  onStart,
  onAskGrownUp,
}: LittleLearnerTodayProps) {
  const { t } = useLocale();

  return (
    <main className="athar-little">
      <h1 className="athar-little__heading">{t("today.heading")}</h1>

      {next ? (
        <>
          {/*
            One control, very large. No second action competes with it, so
            there is no choice for the child to get wrong.
          */}
          <button
            type="button"
            className="athar-little__start"
            onClick={() => onStart(next.candidate.targetId)}
          >
            {t("today.start")}
          </button>
          <p className="athar-little__what">{next.candidate.label}</p>
        </>
      ) : (
        <p className="athar-little__quiet">{t("today.nothingDue")}</p>
      )}

      {/*
        The private sky. A count, not a comparison — there is nobody else's
        number on this screen and no way to reach one.
      */}
      <p className="athar-little__stars">
        <span aria-hidden="true">{"★".repeat(Math.min(revealedStars, 10))}</span>
        <span>{t("evidence.ofTotal", { count: revealedStars, total: totalStars })}</span>
      </p>

      {/* The handoff. Not a settings screen. */}
      <button
        type="button"
        className="athar-little__grownup"
        onClick={onAskGrownUp}
      >
        {t("nav.account")}
      </button>
    </main>
  );
}
