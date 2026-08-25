"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Badge.module.css";

/** Shared with Chip so a filter and its count read as one family. */
export type Tone = "neutral" | "accent" | "success" | "caution" | "danger";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  readonly tone?: Tone | undefined;
  /** A non-colour carrier for the tone, for the colour-blind and for print. */
  readonly dot?: boolean | undefined;
  readonly children: ReactNode;
};

/** A small status marker. Never interactive — reach for Chip when it is. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = "neutral", dot = false, className, children, ...rest },
  ref,
) {
  return (
    <span ref={ref} className={cx(styles.root, styles[tone], className)} {...rest}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
});
