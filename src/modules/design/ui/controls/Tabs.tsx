"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { cx } from "../display/cx";
import styles from "./Tabs.module.css";

export type TabsActivation = "automatic" | "manual";

type TabsContextValue = {
  readonly baseId: string;
  readonly value: string;
  readonly select: (value: string) => void;
  readonly activation: TabsActivation;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (ctx === null) throw new Error("Tabs parts must be used inside <Tabs>");
  return ctx;
}

const tabDomId = (baseId: string, value: string): string => `${baseId}-tab-${value}`;
const panelDomId = (baseId: string, value: string): string => `${baseId}-panel-${value}`;

export type TabsProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  /** Controlled selection. Omit it and pass `defaultValue` to go uncontrolled. */
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly onValueChange?: ((value: string) => void) | undefined;
  /** "automatic" selects on arrow (APG default); "manual" waits for Enter/Space. */
  readonly activation?: TabsActivation | undefined;
  readonly children: ReactNode;
};

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  { value, defaultValue = "", onValueChange, activation = "automatic", className, children, ...rest },
  ref,
) {
  const baseId = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const current = value ?? uncontrolled;

  const select = (next: string): void => {
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ baseId, value: current, select, activation }}>
      <div ref={ref} className={cx(styles.root, className)} {...rest}>
        {children}
      </div>
    </TabsContext.Provider>
  );
});

export type TabListProps = HTMLAttributes<HTMLDivElement> & {
  /** Give the list a name: pass `aria-label` or `aria-labelledby`. */
  readonly children: ReactNode;
};

/** Roving tabindex, arrow keys that follow the reading direction, Home/End. */
export const TabList = forwardRef<HTMLDivElement, TabListProps>(function TabList(
  { className, children, onKeyDown, ...rest },
  ref,
) {
  const { dir } = useSurface();
  const { value, select, activation } = useTabs();
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<{ start: number; size: number } | null>(null);

  useEffect(() => {
    const list = innerRef.current;
    if (list === null) return;

    const measure = (): void => {
      const selected = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (selected === null) {
        setIndicator(null);
        return;
      }
      const start =
        dir === "rtl"
          ? list.clientWidth - (selected.offsetLeft + selected.offsetWidth)
          : selected.offsetLeft;
      setIndicator({ start, size: selected.offsetWidth });
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, dir]);

  const attachRef = (node: HTMLDivElement | null): void => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref !== null && ref !== undefined) (ref as { current: HTMLDivElement | null }).current = node;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    const list = innerRef.current;
    if (list === null) return;

    const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]')).filter(
      (tab) => !tab.disabled,
    );
    if (tabs.length === 0) return;

    const forwardKey = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backKey = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    const focusedIndex = tabs.findIndex((tab) => tab === document.activeElement);
    const from =
      focusedIndex >= 0 ? focusedIndex : Math.max(tabs.findIndex((tab) => tab.dataset.value === value), 0);

    let nextIndex: number | null = null;
    if (event.key === forwardKey) nextIndex = (from + 1) % tabs.length;
    else if (event.key === backKey) nextIndex = (from - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    const target = tabs[nextIndex];
    if (target === undefined) return;

    event.preventDefault();
    target.focus();
    const targetValue = target.dataset.value;
    if (activation === "automatic" && targetValue !== undefined) select(targetValue);
  };

  return (
    <div
      ref={attachRef}
      role="tablist"
      className={cx(styles.list, className)}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
      {indicator === null ? null : (
        <span
          className={styles.indicator}
          aria-hidden="true"
          style={{ insetInlineStart: `${indicator.start}px`, inlineSize: `${indicator.size}px` }}
        />
      )}
    </div>
  );
});

export type TabProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "type"> & {
  readonly value: string;
  readonly children: ReactNode;
};

export const Tab = forwardRef<HTMLButtonElement, TabProps>(function Tab(
  { value, className, onClick, children, ...rest },
  ref,
) {
  const { baseId, value: current, select } = useTabs();
  const selected = current === value;

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    select(value);
    onClick?.(event);
  };

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={tabDomId(baseId, value)}
      data-value={value}
      aria-selected={selected}
      aria-controls={panelDomId(baseId, value)}
      tabIndex={selected ? 0 : -1}
      className={cx(styles.tab, selected && styles.tabSelected, className)}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </button>
  );
});

export type TabPanelProps = HTMLAttributes<HTMLDivElement> & {
  readonly value: string;
  /** Keeps the panel in the DOM (hidden) when another tab is selected. */
  readonly keepMounted?: boolean | undefined;
  readonly children: ReactNode;
};

export const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(function TabPanel(
  { value, keepMounted = false, className, children, ...rest },
  ref,
) {
  const { baseId, value: current } = useTabs();
  const selected = current === value;
  if (!selected && !keepMounted) return null;

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      role="tabpanel"
      id={panelDomId(baseId, value)}
      aria-labelledby={tabDomId(baseId, value)}
      tabIndex={0}
      hidden={!selected}
      className={cx(styles.panel, className)}
      {...rest}
    >
      {children}
    </div>
  );
});
