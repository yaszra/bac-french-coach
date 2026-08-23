"use client";

import { createElement, forwardRef, type AnchorHTMLAttributes, type ElementType, type MouseEvent, type ReactNode } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { cx } from "../display/cx";
import { resolveControlSize, type ControlSize } from "./size";
import type { ButtonVariant } from "./Button";
import buttonStyles from "./Button.module.css";
import styles from "./LinkButton.module.css";

export type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  readonly href: string;
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ControlSize | undefined;
  readonly fullWidth?: boolean | undefined;
  readonly iconStart?: ReactNode | undefined;
  readonly iconEnd?: ReactNode | undefined;
  /** Opens in a new tab, with the safe rel and a mirrored outward mark. */
  readonly external?: boolean | undefined;
  /** Announced as disabled and does not navigate, but stays focusable. */
  readonly disabled?: boolean | undefined;
  /**
   * Swap in a router-aware anchor — `import Link from "next/link"` — for
   * internal navigation. Defaults to a plain <a>.
   */
  readonly as?: ElementType | undefined;
};

/**
 * A link that looks like a button. It is still a link: it navigates, it is
 * middle-clickable, and it never carries an action that changes server state.
 */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  {
    href,
    variant = "secondary",
    size = "md",
    fullWidth = false,
    iconStart,
    iconEnd,
    external = false,
    disabled = false,
    as,
    className,
    onClick,
    children,
    ...rest
  },
  ref,
) {
  const { tier } = useSurface();
  const resolved = resolveControlSize(size, tier);
  const Component: ElementType = as ?? "a";

  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  };

  return createElement(
    Component,
    {
      ref,
      href,
      className: cx(
        buttonStyles.root,
        buttonStyles[variant],
        buttonStyles[resolved],
        fullWidth && buttonStyles.fullWidth,
        styles.root,
        className,
      ),
      onClick: handleClick,
      ...(disabled ? { "aria-disabled": true } : {}),
      ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}),
      ...rest,
    },
    <span className={buttonStyles.content} key="content">
      {iconStart === undefined ? null : (
        <span className={buttonStyles.icon} aria-hidden="true">
          {iconStart}
        </span>
      )}
      {children}
      {iconEnd === undefined ? null : (
        <span className={buttonStyles.icon} aria-hidden="true">
          {iconEnd}
        </span>
      )}
      {external ? (
        <svg className={styles.externalMark} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <polyline points="4.5,1.5 10.5,1.5 10.5,7.5" />
          <line x1="10.5" y1="1.5" x2="5.5" y2="6.5" />
          <polyline points="8.5,9.5 1.5,9.5 1.5,2.5 4,2.5" />
        </svg>
      ) : null}
    </span>,
  );
});
