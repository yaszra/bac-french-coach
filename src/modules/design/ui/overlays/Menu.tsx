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
import { useSurface } from "../../theme/ThemeProvider";
import { useOutsidePointerDown } from "./focus";
import styles from "./Menu.module.css";

export type MenuItemSpec = {
  readonly id: string;
  readonly label: ReactNode;
  /** Typeahead text when the label is a node rather than a string. */
  readonly textValue?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly onSelect?: (() => void) | undefined;
};

export type MenuProps = {
  readonly items: readonly MenuItemSpec[];
  readonly triggerLabel?: ReactNode | undefined;
  /** Accessible name for the trigger. Defaults to `a11y.openMenu`. */
  readonly triggerAriaLabel?: string | undefined;
  readonly align?: "start" | "end" | undefined;
  readonly placement?: "block-end" | "block-start" | undefined;
};

const TYPEAHEAD_RESET_MS = 500;

function textOf(item: MenuItemSpec): string {
  return (item.textValue ?? (typeof item.label === "string" ? item.label : "")).toLowerCase();
}

/**
 * A button-triggered menu.
 *
 * role="menu"/"menuitem", arrow keys with wrap, Home/End, first-letter
 * typeahead, Escape and outside clicks close it and focus returns to the
 * trigger. It is positioned with logical offsets, so it flips in Arabic.
 */
export function Menu({
  items,
  triggerLabel,
  triggerAriaLabel,
  align = "start",
  placement = "block-end",
}: MenuProps) {
  const { t } = useSurface();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeahead = useRef({ buffer: "", at: 0 });
  const menuId = useId();
  const triggerId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useOutsidePointerDown(open, rootRef, () => close(false));

  const focusItem = useCallback((index: number) => {
    const enabled = itemRefs.current;
    const element = enabled[index];
    element?.focus();
  }, []);

  const firstEnabled = useCallback(
    (from: number, step: number): number => {
      if (items.length === 0) return -1;
      for (let offset = 0; offset < items.length; offset += 1) {
        const index = (from + step * offset + items.length * items.length) % items.length;
        if (!items[index]?.disabled) return index;
      }
      return -1;
    },
    [items],
  );

  /* Focus lands on an item only after the list exists in the DOM. */
  const pendingFocus = useRef<"first" | "last" | null>(null);
  const openMenu = useCallback((focus: "first" | "last") => {
    pendingFocus.current = focus;
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open || pendingFocus.current === null) return;
    const which = pendingFocus.current;
    pendingFocus.current = null;
    const index = which === "first" ? firstEnabled(0, 1) : firstEnabled(items.length - 1, -1);
    if (index >= 0) focusItem(index);
  }, [open, firstEnabled, focusItem, items.length]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu("last");
    }
  };

  const onItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(firstEnabled(index + 1, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        focusItem(firstEnabled(index - 1, -1));
        return;
      case "Home":
        event.preventDefault();
        focusItem(firstEnabled(0, 1));
        return;
      case "End":
        event.preventDefault();
        focusItem(firstEnabled(items.length - 1, -1));
        return;
      case "Escape":
        event.preventDefault();
        close(true);
        return;
      case "Tab":
        close(false);
        return;
      default:
        break;
    }

    /* Typeahead: printable single characters only. */
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
    const now = event.timeStamp;
    const state = typeahead.current;
    state.buffer = now - state.at > TYPEAHEAD_RESET_MS ? event.key.toLowerCase() : state.buffer + event.key.toLowerCase();
    state.at = now;
    for (let offset = 1; offset <= items.length; offset += 1) {
      const candidate = (index + offset) % items.length;
      const item = items[candidate];
      if (item && !item.disabled && textOf(item).startsWith(state.buffer)) {
        event.preventDefault();
        focusItem(candidate);
        return;
      }
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel === undefined ? (triggerAriaLabel ?? t("a11y.openMenu")) : triggerAriaLabel}
        onClick={() => (open ? close(false) : openMenu("first"))}
        onKeyDown={onTriggerKeyDown}
      >
        {triggerLabel ?? null}
        <svg className={styles.triggerGlyph} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>

      {open ? (
        <ul
          id={menuId}
          className={styles.menu}
          data-align={align}
          data-placement={placement}
          role="menu"
          aria-labelledby={triggerId}
        >
          {items.map((item, index) => (
            <li key={item.id} className={styles.item} role="none">
              <button
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitem"
                className={styles.itemButton}
                tabIndex={-1}
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect?.();
                  close(true);
                }}
                onKeyDown={(event) => onItemKeyDown(event, index)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
