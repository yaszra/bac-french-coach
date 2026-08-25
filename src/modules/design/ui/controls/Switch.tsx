"use client";

import { forwardRef, useId, useState, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { cx } from "../display/cx";
import shared from "../display/shared.module.css";
import styles from "./Switch.module.css";

export type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type" | "value"> & {
  readonly label: string;
  readonly description?: string | undefined;
  readonly hideLabel?: boolean | undefined;
  readonly checked?: boolean | undefined;
  readonly defaultChecked?: boolean | undefined;
  readonly onCheckedChange?: ((checked: boolean) => void) | undefined;
};

/**
 * A switch takes effect immediately — there is no Save button behind it.
 *
 * It is a real <button role="switch">, so Space and Enter both toggle it
 * through the platform's own key handling; no key handler of ours to trap.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  {
    label,
    description,
    hideLabel = false,
    checked,
    defaultChecked = false,
    onCheckedChange,
    className,
    disabled,
    onClick,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const labelId = `${generatedId}-label`;
  const descriptionId = `${generatedId}-description`;
  const [uncontrolled, setUncontrolled] = useState(defaultChecked);
  const isChecked = checked ?? uncontrolled;

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (disabled === true) return;
    if (checked === undefined) setUncontrolled(!isChecked);
    onCheckedChange?.(!isChecked);
    onClick?.(event);
  };

  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={isChecked}
      aria-labelledby={labelId}
      {...(description === undefined ? {} : { "aria-describedby": descriptionId })}
      disabled={disabled}
      className={cx(styles.root, className)}
      onClick={handleClick}
      {...rest}
    >
      <span className={styles.track}>
        <span className={styles.thumb}>
          <svg className={styles.mark} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            {isChecked ? (
              <polyline points="2.5,6.5 5,9 9.5,3.5" />
            ) : (
              <line x1="3" y1="6" x2="9" y2="6" />
            )}
          </svg>
        </span>
      </span>
      <span className={cx(styles.text, hideLabel && shared.visuallyHidden)}>
        <span id={labelId}>{label}</span>
        {description === undefined ? null : (
          <span className={styles.description} id={descriptionId}>
            {description}
          </span>
        )}
      </span>
    </button>
  );
});
