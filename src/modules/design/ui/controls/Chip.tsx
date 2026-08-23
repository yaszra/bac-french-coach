"use client";

import { forwardRef, type HTMLAttributes, type MouseEventHandler, type ReactNode, type Ref } from "react";
import { cx } from "../display/cx";
import type { Tone } from "../display/Badge";
import { IconButton } from "./IconButton";
import styles from "./Chip.module.css";

export type ChipTone = Tone;

type ChipBase = Omit<HTMLAttributes<HTMLElement>, "children" | "onClick"> & {
  readonly tone?: ChipTone | undefined;
  /** Present (true or false) makes the chip a filter toggle with aria-pressed. */
  readonly selected?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
  readonly children: ReactNode;
};

type ChipRemovable =
  | { readonly onRemove: () => void; readonly removeLabel: string }
  | { readonly onRemove?: undefined; readonly removeLabel?: undefined };

export type ChipProps = ChipBase & ChipRemovable;

const TICK = (
  <svg className={styles.mark} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <polyline points="2.5,6.5 5,9 9.5,3.5" />
  </svg>
);

const CROSS = (
  <svg className={styles.mark} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <line x1="3" y1="3" x2="9" y2="9" />
    <line x1="9" y1="3" x2="3" y2="9" />
  </svg>
);

/**
 * A tag, a filter, or a removable selection. Static by default — it only
 * becomes a control when you give it something to do.
 */
export const Chip = forwardRef<HTMLElement, ChipProps>(function Chip(props, ref) {
  const { tone = "neutral", selected, className, onClick, disabled, children, ...allRest } = props;
  const { onRemove: _onRemove, removeLabel: _removeLabel, ...rest } = allRest;
  const interactive = onClick !== undefined || selected !== undefined;
  const toneClass = selected === true ? styles.selected : styles[tone];
  const removable = props.onRemove !== undefined;

  const bodyClass = removable
    ? cx(styles.groupBody, interactive && styles.interactive)
    : cx(styles.root, interactive && styles.interactive, toneClass, className);

  const body = interactive ? (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      disabled={disabled}
      className={bodyClass}
      {...(selected === undefined ? {} : { "aria-pressed": selected })}
      onClick={onClick}
      {...rest}
    >
      {selected === true ? TICK : null}
      {children}
    </button>
  ) : (
    <span ref={ref as Ref<HTMLSpanElement>} className={bodyClass} {...rest}>
      {children}
    </span>
  );

  if (props.onRemove === undefined) return body;

  return (
    <span className={cx(styles.root, styles.group, toneClass, className)}>
      {body}
      <IconButton
        label={props.removeLabel}
        variant="quiet"
        size="sm"
        disabled={disabled}
        onClick={props.onRemove}
        icon={CROSS}
      />
    </span>
  );
});
