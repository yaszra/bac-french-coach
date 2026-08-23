"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function isVisible(element: HTMLElement): boolean {
  if (element.hidden) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return true;
  return style.display !== "none" && style.visibility !== "hidden";
}

/** Every element inside `container` a keyboard can reach, in document order. */
export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

export type FocusTrapOptions = {
  readonly active: boolean;
  /**
   * The overlay element itself — an element, not a ref, because an overlay
   * rendered through a portal arrives one commit late. Pass a state setter as
   * its `ref` and the trap engages the moment the element exists.
   */
  readonly container: HTMLElement | null;
  readonly initialFocusRef?: RefObject<HTMLElement | null> | undefined;
  readonly onEscape?: (() => void) | undefined;
};

/**
 * Hold focus inside an overlay while it is open, and give it back afterwards.
 *
 * Tab and Shift+Tab cycle within the container; Escape asks the overlay to
 * close; when the overlay goes away the element that opened it is focused
 * again, so a keyboard user never loses their place.
 *
 * Focus is placed once, when the overlay opens — a re-render of the page
 * behind it never yanks the cursor back to the top.
 */
export function useFocusTrap({ active, container, initialFocusRef, onEscape }: FocusTrapOptions) {
  const escape = useRef(onEscape);
  const initial = useRef(initialFocusRef);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    escape.current = onEscape;
    initial.current = initialFocusRef;
  }, [onEscape, initialFocusRef]);

  useEffect(() => {
    if (!active || !container) return;

    const doc = container.ownerDocument;
    previouslyFocused.current =
      doc.activeElement instanceof HTMLElement ? doc.activeElement : null;

    const target = initial.current?.current ?? focusableWithin(container)[0] ?? container;
    if (target === container && !container.hasAttribute("tabindex")) {
      container.setAttribute("tabindex", "-1");
    }
    target.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        escape.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableWithin(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const activeElement = doc.activeElement;
      if (event.shiftKey && (activeElement === first || !container.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    /* Focus that escapes the overlay (a stray programmatic focus) is pulled back. */
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !container.contains(event.target)) {
        (focusableWithin(container)[0] ?? container).focus();
      }
    };

    doc.addEventListener("keydown", onKeyDown, true);
    doc.addEventListener("focusin", onFocusIn);
    return () => {
      doc.removeEventListener("keydown", onKeyDown, true);
      doc.removeEventListener("focusin", onFocusIn);
      previouslyFocused.current?.focus();
    };
  }, [active, container]);
}

/** Stop the page behind an overlay from scrolling, and restore it exactly. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, [active]);
}

/** Close when a pointer goes down anywhere outside `containerRef`. */
export function useOutsidePointerDown(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onOutside: () => void,
) {
  const handler = useRef(onOutside);
  useEffect(() => {
    handler.current = onOutside;
  }, [onOutside]);

  useEffect(() => {
    if (!active) return;
    const listener = (event: Event) => {
      const container = containerRef.current;
      if (!container) return;
      if (event.target instanceof Node && !container.contains(event.target)) handler.current();
    };
    document.addEventListener("pointerdown", listener, true);
    return () => document.removeEventListener("pointerdown", listener, true);
  }, [active, containerRef]);
}
