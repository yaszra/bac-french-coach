"use client";

import { forwardRef, useId, type HTMLAttributes } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { cx } from "./cx";
import styles from "./Progress.module.css";

export type ProgressSize = "sm" | "md";
export type ProgressTone = "accent" | "success" | "milestone";

type ProgressBase = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /** When given, the denominator is rendered beside it. Also names the meter. */
  readonly label?: string | undefined;
  readonly size?: ProgressSize | undefined;
  readonly tone?: ProgressTone | undefined;
};

export type ProgressProps =
  | (ProgressBase & {
      readonly value: number;
      readonly max?: number | undefined;
      readonly indeterminate?: false | undefined;
      readonly unknown?: false | undefined;
    })
  | (ProgressBase & {
      readonly indeterminate: true;
      readonly value?: undefined;
      readonly max?: undefined;
      readonly unknown?: false | undefined;
    })
  | (ProgressBase & {
      readonly unknown: true;
      readonly value?: undefined;
      readonly max?: undefined;
      readonly indeterminate?: false | undefined;
    });

/**
 * A linear meter.
 *
 * Three honest states, never blended: a real rate (always shown with its
 * denominator), work in flight (`indeterminate`), and nothing recorded yet
 * (`unknown`) — which renders the not-yet-recorded state rather than a 0%
 * that would read as failure.
 */
export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(props, ref) {
  const { t } = useSurface();
  const generatedId = useId();
  const { label, size = "md", tone = "accent", className, ...rest } = props;
  const labelId = `${generatedId}-label`;

  if (props.unknown === true) {
    const { unknown: _unknown, ...divProps } = rest as typeof rest & { unknown?: boolean };
    return (
      <div ref={ref} className={cx(styles.root, className)} {...divProps}>
        {label === undefined ? null : (
          <div className={styles.header}>
            <span className={styles.label} id={labelId}>
              {label}
            </span>
          </div>
        )}
        <div className={cx(styles.track, styles.unknownTrack, styles[size])} />
        <span className={styles.unknownText}>{t("state.notYetRecorded")}</span>
      </div>
    );
  }

  if (props.indeterminate === true) {
    const { indeterminate: _indeterminate, ...divProps } = rest as typeof rest & { indeterminate?: boolean };
    return (
      <div ref={ref} className={cx(styles.root, className)} {...divProps}>
        {label === undefined ? null : (
          <div className={styles.header}>
            <span className={styles.label} id={labelId}>
              {label}
            </span>
          </div>
        )}
        <div
          role="progressbar"
          aria-busy="true"
          {...(label === undefined ? {} : { "aria-labelledby": labelId })}
          className={cx(styles.track, styles[size])}
        >
          <span className={cx(styles.fill, styles.indeterminate, styles[tone])} />
        </div>
      </div>
    );
  }

  const { value, max = 100, ...divProps } = rest as typeof rest & { value: number; max?: number };
  const total = max > 0 ? max : 0;
  const done = Math.min(Math.max(value, 0), total);
  const percent = total === 0 ? 0 : (done / total) * 100;
  const valueText = t("progress.ofReviewed", { done, total });

  return (
    <div ref={ref} className={cx(styles.root, className)} {...divProps}>
      {label === undefined ? null : (
        <div className={styles.header}>
          <span className={styles.label} id={labelId}>
            {label}
          </span>
          <span className={styles.denominator}>{valueText}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={valueText}
        {...(label === undefined ? {} : { "aria-labelledby": labelId })}
        className={cx(styles.track, styles[size])}
      >
        <span className={cx(styles.fill, styles[tone])} style={{ inlineSize: `${percent}%` }} />
      </div>
    </div>
  );
});
