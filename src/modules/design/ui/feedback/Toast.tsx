"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import type { MessageParams } from "../../../platform/i18n/types";
import styles from "./Toast.module.css";

export type ToastTone = "neutral" | "success" | "caution" | "danger";

export type ToastInput = {
  /** A key in messages/*.json. Toasts never carry literal strings. */
  readonly messageKey: string;
  readonly params?: MessageParams | undefined;
  readonly tone?: ToastTone | undefined;
  /** 0 keeps the toast until it is dismissed. */
  readonly durationMs?: number | undefined;
  /** Accessible name for the dismiss control. Defaults to `a11y.closeDialog`. */
  readonly closeLabel?: string | undefined;
};

export type ToastRecord = ToastInput & { readonly id: string };

export type ToastProps = ToastRecord & {
  readonly onDismiss: (id: string) => void;
};

export const TOAST_DEFAULT_DURATION_MS = 6000;

/**
 * One notice. It counts down on its own and pauses while a pointer is over it
 * or focus is inside it, so it can never vanish mid-read.
 *
 * A toast is for the INTERFACE — saved, offline, syncing. Never for anything
 * sacred: no āyah, no verdict on a recitation, no claim about memory. Those
 * belong on the page or in a task, where they persist and can be checked.
 */
export function Toast({
  id,
  messageKey,
  params,
  tone = "neutral",
  durationMs = TOAST_DEFAULT_DURATION_MS,
  closeLabel,
  onDismiss,
}: ToastProps) {
  const { t } = useSurface();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(durationMs);
  const startedAt = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (startedAt.current !== null) {
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
      startedAt.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (durationMs <= 0 || timer.current !== null) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => onDismiss(id), remaining.current);
  }, [durationMs, id, onDismiss]);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  return (
    <div
      className={styles.toast}
      data-tone={tone}
      data-toast-id={id}
      onMouseEnter={stop}
      onMouseLeave={start}
      onFocusCapture={stop}
      onBlurCapture={start}
    >
      <span className={styles.message}>{t(messageKey, params)}</span>
      <button
        type="button"
        className={styles.close}
        aria-label={closeLabel ?? t("a11y.closeDialog")}
        onClick={() => onDismiss(id)}
      >
        <svg className={styles.closeGlyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
