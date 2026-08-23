"use client";

import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { cx } from "../display/cx";
import { Spinner } from "../display/Spinner";
import { resolveControlSize, type ControlSize } from "./size";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = ControlSize;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant | undefined;
  /** Bumped one step automatically in the kids tier. */
  readonly size?: ButtonSize | undefined;
  /** Busy, not disabled: stays focusable, keeps its width, cannot be fired. */
  readonly loading?: boolean | undefined;
  readonly fullWidth?: boolean | undefined;
  readonly iconStart?: ReactNode | undefined;
  readonly iconEnd?: ReactNode | undefined;
};

/**
 * The one obvious next action wears `variant="primary"`. There is never a
 * second primary on a screen.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    fullWidth = false,
    iconStart,
    iconEnd,
    disabled,
    type = "button",
    className,
    onClick,
    children,
    ...rest
  },
  ref,
) {
  const { tier } = useSurface();
  const resolved = resolveControlSize(size, tier);

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (loading || disabled === true) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cx(
        styles.root,
        styles[variant],
        styles[resolved],
        fullWidth && styles.fullWidth,
        className,
      )}
      aria-busy={loading ? true : undefined}
      aria-disabled={loading ? true : undefined}
      data-loading={loading ? "true" : undefined}
      onClick={handleClick}
      {...rest}
    >
      <span className={styles.content}>
        {iconStart === undefined ? null : (
          <span className={styles.icon} aria-hidden="true">
            {iconStart}
          </span>
        )}
        {children}
        {iconEnd === undefined ? null : (
          <span className={styles.icon} aria-hidden="true">
            {iconEnd}
          </span>
        )}
      </span>
      {loading ? (
        <span className={styles.busy}>
          <Spinner size="sm" decorative />
        </span>
      ) : null}
    </button>
  );
});
