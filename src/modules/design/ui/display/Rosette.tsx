"use client";

import { forwardRef, useId, type HTMLAttributes, type ReactNode } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { cx } from "./cx";
import styles from "./Rosette.module.css";

export type RosetteSize = "sm" | "md" | "lg";

export type RosetteProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  readonly value: number;
  readonly max?: number | undefined;
  readonly size?: RosetteSize | undefined;
  /** Switches the ring to gold. Gold is reserved for milestones — nothing else. */
  readonly milestone?: boolean | undefined;
  /** Names the meter. Give this or an `aria-label`. */
  readonly label?: string | undefined;
  /** Sits in the eye of the rosette, as the āyah number does. Ignored at "sm". */
  readonly children?: ReactNode | undefined;
};

const CENTRE = 24;
const RING_RADIUS = 17;
const NOTCH_INNER = 20;
const NOTCH_OUTER = 23;
const NOTCH_COUNT = 8;

const round = (n: number): number => Math.round(n * 1000) / 1000;

const NOTCHES = Array.from({ length: NOTCH_COUNT }, (_unused, index) => {
  const radians = ((index * (360 / NOTCH_COUNT) - 90) * Math.PI) / 180;
  return {
    x1: round(CENTRE + Math.cos(radians) * NOTCH_INNER),
    y1: round(CENTRE + Math.sin(radians) * NOTCH_INNER),
    x2: round(CENTRE + Math.cos(radians) * NOTCH_OUTER),
    y2: round(CENTRE + Math.sin(radians) * NOTCH_OUTER),
  };
});

/** The circular progress mark. Accessible exactly as Progress is. */
export const Rosette = forwardRef<HTMLSpanElement, RosetteProps>(function Rosette(
  { value, max = 100, size = "md", milestone = false, label, className, children, ...rest },
  ref,
) {
  const { t } = useSurface();
  const generatedId = useId();
  const labelId = `${generatedId}-label`;

  const total = max > 0 ? max : 100;
  const done = Math.min(Math.max(value, 0), total);
  const percent = (done / total) * 100;
  const valueText = t("progress.ofReviewed", { done, total });
  /* A notch is lit once the arc has passed it — the mark still reads at a
     glance in greyscale, so progress is never carried by colour alone. */
  const litNotches = Math.floor((done / total) * NOTCH_COUNT);

  return (
    <span
      ref={ref}
      className={cx(styles.root, styles[size], milestone && styles.milestone, className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={valueText}
      {...(label === undefined ? {} : { "aria-labelledby": labelId })}
      {...rest}
    >
      {label === undefined ? null : (
        <span id={labelId} hidden>
          {label}
        </span>
      )}
      <svg className={styles.svg} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle className={styles.track} cx={CENTRE} cy={CENTRE} r={RING_RADIUS} />
        <circle
          className={styles.arc}
          cx={CENTRE}
          cy={CENTRE}
          r={RING_RADIUS}
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={round(100 - percent)}
        />
        {NOTCHES.map((notch, index) => (
          <line
            key={index}
            className={cx(styles.notch, index < litNotches && styles.notchEarned)}
            x1={notch.x1}
            y1={notch.y1}
            x2={notch.x2}
            y2={notch.y2}
          />
        ))}
      </svg>
      {size === "sm" || children === undefined ? null : (
        <span className={styles.center} aria-hidden="true">
          {children}
        </span>
      )}
    </span>
  );
});
