"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSurface } from "../theme/ThemeProvider";
import { ShellNav } from "./ShellNav";
import type { ShellNavItem } from "./nav";
import styles from "./TeacherShell.module.css";

export type TeacherDestination =
  | "triage"
  | "students"
  | "assign"
  | "verify"
  | "khatma"
  | "notifications";

const DESTINATIONS: readonly TeacherDestination[] = [
  "triage",
  "students",
  "assign",
  "verify",
  "khatma",
  "notifications",
];

/** Below this the sidebar becomes a rail on its own. */
const RAIL_QUERY = "(max-width: 1079px)";

export type TeacherShellProps = {
  readonly active: TeacherDestination;
  readonly items?: readonly ShellNavItem<TeacherDestination>[] | undefined;
  /** The class in front of the teacher, supplied by the caller. */
  readonly activeClass?: ReactNode | undefined;
  /** Actions for the top bar — controls, never data. */
  readonly toolbar?: ReactNode | undefined;
  readonly defaultCollapsed?: boolean | undefined;
  readonly children: ReactNode;
};

/**
 * The teacher's frame: persistent sidebar, a top bar that always says which
 * class this is, and a collapsible rail on tablets.
 *
 * Layout only. Triage, verification and assignment live in their own modules;
 * this shell never knows what a student needs.
 */
export function TeacherShell({
  active,
  items,
  activeClass,
  toolbar,
  defaultCollapsed,
  children,
}: TeacherShellProps) {
  const { t } = useSurface();
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  const chosenByTeacher = useRef(defaultCollapsed !== undefined);

  /* Tablet fallback — until the teacher decides for themselves. */
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(RAIL_QUERY);
    const apply = () => {
      if (!chosenByTeacher.current) setCollapsed(query.matches);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return (
    <div className={styles.shell} data-collapsed={collapsed ? "true" : undefined}>
      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.toggle}
          aria-label={t("a11y.menu")}
          aria-expanded={!collapsed}
          onClick={() => {
            chosenByTeacher.current = true;
            setCollapsed((current) => !current);
          }}
        >
          <svg className={styles.toggleGlyph} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" />
          </svg>
        </button>
        {activeClass === undefined ? null : <div className={styles.classLabel}>{activeClass}</div>}
        {toolbar === undefined ? null : <div className={styles.toolbar}>{toolbar}</div>}
      </div>

      <div className={styles.navArea}>
        <ShellNav
          destinations={DESTINATIONS}
          active={active}
          items={items}
          variant="sidebar"
          collapsed={collapsed}
        />
      </div>

      <div className={styles.main}>{children}</div>
    </div>
  );
}
