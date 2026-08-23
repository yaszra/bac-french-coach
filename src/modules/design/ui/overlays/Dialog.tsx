"use client";

import { useId, useRef, type MouseEvent, type ReactNode, type RefObject } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { Portal } from "./Portal";
import { useFocusTrap, useScrollLock } from "./focus";
import styles from "./Dialog.module.css";

export type DialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The dialogue's name. Always present: a modal without a title is a trap. */
  readonly title: ReactNode;
  readonly description?: ReactNode | undefined;
  readonly children?: ReactNode | undefined;
  readonly footer?: ReactNode | undefined;
  readonly size?: "sm" | "md" | "lg" | undefined;
  readonly initialFocusRef?: RefObject<HTMLElement | null> | undefined;
  /** Clicking the backdrop closes. Turn off for destructive confirmations. */
  readonly dismissOnBackdrop?: boolean | undefined;
};

/**
 * A modal dialogue: focus enters it, stays in it, and returns to where it came
 * from. Escape dismisses, the page behind it cannot scroll, and it renders
 * through a portal so no pane can clip it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  initialFocusRef,
  dismissOnBackdrop = true,
}: DialogProps) {
  const { t } = useSurface();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useFocusTrap({ active: open, containerRef, initialFocusRef, onEscape: onClose });
  useScrollLock(open);

  if (!open) return null;

  const onBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
  };

  return (
    <Portal>
      <div className={styles.backdrop} onMouseDown={onBackdropMouseDown}>
        <div
          ref={containerRef}
          className={styles.dialog}
          data-size={size}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description === undefined ? undefined : descriptionId}
        >
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button
              type="button"
              className={styles.close}
              aria-label={t("a11y.closeDialog")}
              onClick={onClose}
            >
              <svg className={styles.closeGlyph} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />
              </svg>
            </button>
          </div>

          {description === undefined ? null : (
            <p id={descriptionId} className={styles.description}>
              {description}
            </p>
          )}

          {children === undefined ? null : <div className={styles.body}>{children}</div>}
          {footer === undefined ? null : <div className={styles.footer}>{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}
