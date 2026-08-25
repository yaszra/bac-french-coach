"use client";

import type { ReactNode } from "react";
import { ShellNav } from "./ShellNav";
import type { ShellNavItem } from "./nav";
import styles from "./ParentShell.module.css";

export type ParentDestination = "children" | "tonight" | "tutor" | "settings";

/**
 * The default order. "tutor" is deliberately not in it: a guardian who has not
 * been granted tutoring should never see a tab for it, so the family app passes
 * its own items and includes that one only when the link says they tutor.
 */
const DESTINATIONS: readonly ParentDestination[] = ["children", "tonight", "settings"];

export type ParentShellProps = {
  readonly active: ParentDestination;
  readonly items?: readonly ShellNavItem<ParentDestination>[] | undefined;
  readonly header?: ReactNode | undefined;
  readonly children: ReactNode;
};

/**
 * The family's frame: a few destinations, phone-first, generous spacing.
 *
 * Layout only — what a parent may see about their child is decided by the
 * family module and its consent rules, never here.
 */
export function ParentShell({ active, items, header, children }: ParentShellProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.main}>
        {header === undefined ? null : <div className={styles.header}>{header}</div>}
        <div className={styles.content}>{children}</div>
      </div>
      <div className={styles.navArea}>
        <ShellNav destinations={DESTINATIONS} active={active} items={items} variant="responsive" />
      </div>
    </div>
  );
}
