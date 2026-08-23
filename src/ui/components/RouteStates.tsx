/**
 * The seven states every route must ship, from docs/02.
 *
 * They live in one file because "we forgot the offline state" is the most
 * common way a screen ships half-finished, and a single import makes the
 * omission visible in review.
 */
import type { ReactNode } from "react";
import { useLocale } from "../i18n/context.js";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useLocale();
  return (
    // A skeleton that preserves layout: a spinner that collapses the page
    // and then expands it is a layout shift with extra steps.
    <div className="athar-state athar-state--loading" role="status" aria-live="polite">
      <span className="athar-visually-hidden">{label ?? t("state.loading")}</span>
      <div className="athar-skeleton" aria-hidden="true" />
    </div>
  );
}

export function EmptyState({
  heading,
  children,
}: {
  heading?: string;
  children?: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="athar-state athar-state--empty">
      <h2>{heading ?? t("state.empty")}</h2>
      {/* An empty state says what would fill it and what to do next. */}
      {children}
    </div>
  );
}

export function StaleDataNotice({ minutesOld }: { minutesOld: number }) {
  const { t } = useLocale();
  return (
    <p className="athar-state athar-state--stale" role="status">
      {t("state.stale", { minutes: minutesOld })}
    </p>
  );
}

/**
 * Permission denied.
 *
 * Names who can grant access, and leaks nothing about the resource — not
 * its existence, not its owner, not a learner's name.
 */
export function PermissionDeniedState() {
  const { t } = useLocale();
  return (
    <div className="athar-state athar-state--denied" role="alert">
      <h2>{t("state.denied")}</h2>
      <p>{t("state.deniedHelp")}</p>
    </div>
  );
}

export function OfflineState() {
  const { t } = useLocale();
  return (
    <p className="athar-state athar-state--offline" role="status">
      {t("state.offline")}
    </p>
  );
}

/** A retry that does not lose the learner's input. */
export function RecoverableErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <div className="athar-state athar-state--error" role="alert">
      <h2>{t("state.error")}</h2>
      <button type="button" onClick={onRetry}>
        {t("state.retry")}
      </button>
    </div>
  );
}
