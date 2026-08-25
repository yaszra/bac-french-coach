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
 * Three honest states, never blended: a real rate (always rendered with the
 * denominator it was computed from), work in flight (`indeterminate`), and
 * nothing recorded yet (`unknown`) — which renders the not-yet-recorded state
 * rather than a fabricated 0% that would read as failure.
 */
export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(props, ref) {
  const { t } = useSurface();
  const generatedId = useId();
  const {
    label,
    size = "md",
    tone = "accent",
    className,
    value,
    max,
    indeterminate,
    unknown,
    ...divProps
  } = props;
  const labelId = `${generatedId}-label`;
  const nameProps = label === undefined ? {} : { "aria-labelledby": labelId };

  const header = (denominator?: string) =>
    label === undefined ? null : (
      <div className={styles.header}>
        <span className={styles.label} id={labelId}>
          {label}
        </span>
        {denominator === undefined ? null : <span className={styles.denominator}>{denominator}</span>}
      </div>
    );

  if (unknown === true) {
    return (
      <div ref={ref} className={cx(styles.root, className)} {...divProps}>
        {header()}
        <div className={cx(styles.track, styles.unknownTrack, styles[size])} />
        <span className={styles.unknownText}>{t("state.notYetRecorded")}</span>
      </div>
    );
  }

  if (indeterminate === true) {
    return (
      <div ref={ref} className={cx(styles.root, className)} {...divProps}>
        {header()}
        <div role="progressbar" aria-busy="true" {...nameProps} className={cx(styles.track, styles[size])}>
          <span className={cx(styles.fill, styles.indeterminate, styles[tone])} />
        </div>
      </div>
    );
  }

  const total = max === undefined || max <= 0 ? 100 : max;
  const done = Math.min(Math.max(value ?? 0, 0), total);
  const percent = (done / total) * 100;
  const valueText = t("progress.ofReviewed", { done, total });

  return (
    <div ref={ref} className={cx(styles.root, className)} {...divProps}>
      {header(valueText)}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={valueText}
        {...nameProps}
        className={cx(styles.track, styles[size])}
      >
        <span className={cx(styles.fill, styles[tone])} style={{ inlineSize: `${percent}%` }} />
      </div>
    </div>
  );
});
