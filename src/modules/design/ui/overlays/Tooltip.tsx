"use client";

import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { MOTION_BASE_MS } from "./motion";
import styles from "./Tooltip.module.css";

type TriggerProps = HTMLAttributes<HTMLElement> & { "aria-describedby"?: string | undefined };

export type TooltipProps = {
  readonly content: ReactNode;
  /** A single focusable element — a control, never a muṣḥaf word. */
  readonly children: ReactElement<TriggerProps>;
  readonly placement?: "block-start" | "block-end" | undefined;
  /** Hover delay. Focus opens immediately: keyboard users do not linger. */
  readonly delayMs?: number | undefined;
};

/**
 * A hint on hover AND on focus.
 *
 * It is never the only carrier of information — treat it as a second telling
 * of something already visible or already in the accessible name. Coarse
 * pointers get nothing at all, by design.
 */
export function Tooltip({
  content,
  children,
  placement = "block-start",
  delayMs = MOTION_BASE_MS,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const openAfterDelay = useCallback(() => {
    clear();
    timer.current = setTimeout(() => setOpen(true), delayMs);
  }, [clear, delayMs]);

  const closeNow = useCallback(() => {
    clear();
    setOpen(false);
  }, [clear]);

  /* Touch has no hover: a tooltip there would be a trap, so there is none. */
  const coarsePointer =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : false;

  const childProps = children.props;

  const trigger = cloneElement(children, {
    "aria-describedby": open ? id : childProps["aria-describedby"],
    onMouseEnter: (event: MouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(event);
      if (!coarsePointer) openAfterDelay();
    },
    onMouseLeave: (event: MouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(event);
      closeNow();
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(event);
      clear();
      setOpen(true);
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(event);
      closeNow();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      childProps.onKeyDown?.(event);
      if (event.key === "Escape") closeNow();
    },
  });

  return (
    <span className={styles.root}>
      {trigger}
      {open ? (
        <span id={id} role="tooltip" className={styles.bubble} data-placement={placement}>
          {content}
        </span>
      ) : null}
    </span>
  );
}
