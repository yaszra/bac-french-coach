"use client";

import {
  useId,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { Portal } from "./Portal";
import { useFocusTrap, useScrollLock } from "./focus";
import styles from "./Sheet.module.css";

export type SheetVariant = "bottom" | "inline-start";

export type SheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly children?: ReactNode | undefined;
  readonly footer?: ReactNode | undefined;
  /** `bottom` is the phone default; `inline-start` is the desktop drawer. */
  readonly variant?: SheetVariant | undefined;
  /** Drag-to-dismiss on the bottom sheet. Keyboard and Escape always work. */
  readonly draggable?: boolean | undefined;
  readonly initialFocusRef?: RefObject<HTMLElement | null> | undefined;
  readonly dismissOnBackdrop?: boolean | undefined;
};

/** How far the sheet must be pulled down before it lets go. */
const DISMISS_DISTANCE_PX = 88;

/**
 * A bottom sheet for the phone, a drawer for the desktop.
 *
 * The drawer enters from the inline start, so it is on the right in Arabic
 * without a single physical property. Dragging is a convenience; Escape, the
 * close button and the backdrop are always there for everyone else.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  variant = "bottom",
  draggable = true,
  initialFocusRef,
  dismissOnBackdrop = true,
}: SheetProps) {
  const { t } = useSurface();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const dragStart = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  useFocusTrap({ active: open, containerRef, initialFocusRef, onEscape: onClose });
  useScrollLock(open);

  if (!open) return null;

  const canDrag = draggable && variant === "bottom";

  const onBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canDrag) return;
    dragStart.current = event.clientY;
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return;
    setDragOffset(Math.max(0, event.clientY - dragStart.current));
  };

  const onPointerUp = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (dragOffset > DISMISS_DISTANCE_PX) onClose();
    setDragOffset(0);
  };

  return (
    <Portal>
      <div className={styles.backdrop} data-variant={variant} onMouseDown={onBackdropMouseDown}>
        <div
          ref={containerRef}
          className={styles.sheet}
          data-variant={variant}
          data-dragging={dragStart.current === null ? undefined : "true"}
          style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          {canDrag ? (
            <div
              className={styles.grabber}
              aria-hidden="true"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <span className={styles.grabberBar} />
            </div>
          ) : null}

          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button
              type="button"
              className={styles.close}
              aria-label={t("action.close")}
              onClick={onClose}
            >
              <svg className={styles.closeGlyph} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />
              </svg>
            </button>
          </div>

          {children === undefined ? null : <div className={styles.body}>{children}</div>}
          {footer === undefined ? null : <div className={styles.footer}>{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}
