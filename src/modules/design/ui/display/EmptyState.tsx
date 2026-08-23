"use client";

import { createElement, forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { cx } from "./cx";
import styles from "./EmptyState.module.css";

export type EmptyStateVariant = "empty" | "not-yet-recorded";

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title" | "children"> & {
  readonly icon?: ReactNode | undefined;
  /** Defaults to the honest state string for the variant. */
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  /** Exactly one action. Pass a single <Button> or <LinkButton>. */
  readonly action?: ReactNode | undefined;
  readonly variant?: EmptyStateVariant | undefined;
  readonly headingLevel?: 2 | 3 | 4 | undefined;
};

/**
 * Nothing here yet — said plainly.
 *
 * `variant="not-yet-recorded"` is the honest state for evidence that has never
 * been captured: it is not an error and it is not a zero.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon, title, description, action, variant = "empty", headingLevel = 3, className, ...rest },
  ref,
) {
  const { t } = useSurface();
  const heading = title ?? t(variant === "not-yet-recorded" ? "state.notYetRecorded" : "state.empty");

  return (
    <div
      ref={ref}
      className={cx(styles.root, variant === "not-yet-recorded" && styles.notYetRecorded, className)}
      {...rest}
    >
      {icon === undefined ? null : (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      {createElement(`h${headingLevel}` as const, { className: styles.title }, heading)}
      {description === undefined ? null : <p className={styles.description}>{description}</p>}
      {action === undefined ? null : <div className={styles.action}>{action}</div>}
    </div>
  );
});
