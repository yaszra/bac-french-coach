"use client";

import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { cx } from "../display/cx";
import { Spinner } from "../display/Spinner";
import { resolveControlSize, type ControlSize } from "./size";
import type { ButtonVariant } from "./Button";
import buttonStyles from "./Button.module.css";
import styles from "./IconButton.module.css";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /**
   * Required. An icon-only control with no accessible name is invisible to
   * screen reader users, so the type system will not let you ship one.
   */
  readonly label: string;
  readonly icon: ReactNode;
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ControlSize | undefined;
  readonly loading?: boolean | undefined;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    variant = "quiet",
    size = "sm",
    loading = false,
    disabled,
    type = "button",
    className,
    onClick,
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
      aria-label={label}
      className={cx(buttonStyles.root, buttonStyles[variant], styles.root, styles[resolved], className)}
      aria-busy={loading ? true : undefined}
      aria-disabled={loading ? true : undefined}
      data-loading={loading ? "true" : undefined}
      onClick={handleClick}
      {...rest}
    >
      <span className={cx(buttonStyles.content, styles.glyph)} aria-hidden="true">
        {icon}
      </span>
      {loading ? (
        <span className={buttonStyles.busy}>
          <Spinner size="sm" decorative />
        </span>
      ) : null}
    </button>
  );
});
