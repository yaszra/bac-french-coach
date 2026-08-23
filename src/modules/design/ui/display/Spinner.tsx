"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { cx } from "./cx";
import styles from "./Spinner.module.css";
import shared from "./shared.module.css";

export type SpinnerSize = "sm" | "md" | "lg";

export type SpinnerProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  readonly size?: SpinnerSize | undefined;
  /** Overrides the built-in "Loading" announcement. Ignored when `decorative`. */
  readonly label?: string | undefined;
  /**
   * Renders the ring with no role and no live text. Used where the busy state
   * is already announced by the host control (Button sets `aria-busy`), so the
   * page is never told "Loading" twice.
   */
  readonly decorative?: boolean | undefined;
};

/** A calm ring. Never a pulse, never a bounce. */
export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = "sm", label, decorative = false, className, ...rest },
  ref,
) {
  const { t } = useSurface();

  return (
    <span
      ref={ref}
      className={cx(styles.root, styles[size], className)}
      {...(decorative ? { "aria-hidden": true } : { role: "status" })}
      {...rest}
    >
      <svg className={styles.ring} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle className={styles.track} cx="12" cy="12" r="10" />
        <circle className={styles.arc} cx="12" cy="12" r="10" />
      </svg>
      {decorative ? null : <span className={shared.visuallyHidden}>{label ?? t("a11y.loading")}</span>}
    </span>
  );
});
