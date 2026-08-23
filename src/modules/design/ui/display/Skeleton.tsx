"use client";

import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";
import { cx } from "./cx";
import styles from "./Skeleton.module.css";

export type SkeletonVariant = "text" | "block" | "circle";

export type SkeletonProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  readonly variant?: SkeletonVariant | undefined;
  /** Number of text lines. Ignored outside `variant="text"`. */
  readonly lines?: number | undefined;
  /** Caller-owned layout only — a CSS length, e.g. "12rem" or "100%". */
  readonly width?: string | undefined;
  readonly height?: string | undefined;
};

/**
 * A loading placeholder. Always `aria-hidden`: the caller owns the live region
 * that announces "Loading", so assistive tech hears it once, not once per box.
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { variant = "text", lines = 1, width, height, className, style, ...rest },
  ref,
) {
  const sizing: CSSProperties = {
    ...style,
    ...(width === undefined ? {} : { inlineSize: width }),
    ...(height === undefined ? {} : { blockSize: height }),
  };

  if (variant === "text" && lines > 1) {
    return (
      <div ref={ref} className={cx(styles.group, className)} aria-hidden="true" {...rest}>
        {Array.from({ length: lines }, (_unused, index) => (
          <div
            key={index}
            className={cx(styles.root, styles.text, index === lines - 1 && styles.lastLine)}
            style={index === lines - 1 ? style : sizing}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cx(styles.root, styles[variant], className)}
      style={sizing}
      aria-hidden="true"
      {...rest}
    />
  );
});
