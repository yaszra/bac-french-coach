"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { MOTION_BASE_MS } from "./motion";
import styles from "./Tooltip.module.css";

export type TooltipProps = {
  readonly content: ReactNode;
  /** A single focusable element — a control, never a muṣḥaf word. */
  readonly children: ReactNode;
  readonly placement?: "block-start" | "block-end" | undefined;
  /** Hover delay. Focus opens immediately: keyboard users do not linger. */
  readonly delayMs?: number | undefined;
};

/**
 * A hint on hover AND on focus.
 *
 * It is never the only carrier of information — treat it as a second telling
 * of something already visible or already in the accessible name. Coarse
 * pointers get nothing at all, by design: there is no hover on a finger.
 *
 * The trigger keeps its own identity: the tooltip describes it by setting
 * `aria-describedby` on the element itself while it is open, and putting back
 * whatever was there before when it closes.
 */
export function Tooltip({
  content,
  children,
  placement = "block-start",
  delayMs = MOTION_BASE_MS,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  /* Describe the trigger itself, not the wrapper around it. */
  useEffect(() => {
    const trigger = rootRef.current?.firstElementChild;
    if (!trigger) return;
    const previous = trigger.getAttribute("aria-describedby");
    if (open) trigger.setAttribute("aria-describedby", id);
    else if (previous === id) trigger.removeAttribute("aria-describedby");
    return () => {
      if (trigger.getAttribute("aria-describedby") !== id) return;
      if (previous === null) trigger.removeAttribute("aria-describedby");
      else trigger.setAttribute("aria-describedby", previous);
    };
  }, [open, id]);

  const openAfterDelay = useCallback(() => {
    /* Touch has no hover: a tooltip there would be a trap, so there is none. */
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      if (window.matchMedia("(pointer: coarse)").matches) return;
    }
    clear();
    timer.current = setTimeout(() => setOpen(true), delayMs);
  }, [clear, delayMs]);

  const closeNow = useCallback(() => {
    clear();
    setOpen(false);
  }, [clear]);

  return (
    <span
      ref={rootRef}
      className={styles.root}
      onMouseEnter={openAfterDelay}
      onMouseLeave={closeNow}
      /* focus/blur bubble as focusin/focusout, so the wrapper hears the
         trigger without cloning it or taking its ref. */
      onFocus={() => {
        clear();
        setOpen(true);
      }}
      onBlur={closeNow}
      onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
        if (event.key === "Escape") closeNow();
      }}
    >
      {children}
      {open ? (
        <span id={id} role="tooltip" className={styles.bubble} data-placement={placement}>
          {content}
        </span>
      ) : null}
    </span>
  );
}
