"use client";

import type { ReactNode } from "react";
import { useSurface } from "../theme/ThemeProvider";
import { policyFor } from "../theme/tier";
import { ShellNav } from "./ShellNav";
import type { ShellNavItem } from "./nav";
import styles from "./LearnerShell.module.css";

export type LearnerDestination = "today" | "quran" | "reading" | "practice" | "me";

const ALL_DESTINATIONS: readonly LearnerDestination[] = [
  "today",
  "quran",
  "reading",
  "practice",
  "me",
];

/** Children get three doors and no settings: guided-only, by policy. */
const KIDS_DESTINATIONS: readonly LearnerDestination[] = ["today", "quran", "reading"];

export type LearnerShellProps = {
  readonly active: LearnerDestination;
  readonly items?: readonly ShellNavItem<LearnerDestination>[] | undefined;
  /** A calm title row above the content. Never a search field. */
  readonly header?: ReactNode | undefined;
  readonly children: ReactNode;
};

/**
 * The learner's frame: a bottom tab bar on the phone, a rail from 700px, and
 * a single <nav> landmark either way.
 *
 * The tier decides how many doors there are — three for children, five for
 * everyone else — and the kids surface carries no text input at all: this
 * shell never renders one, and nothing inside it should either.
 */
export function LearnerShell({ active, items, header, children }: LearnerShellProps) {
  const { tier } = useSurface();
  const policy = policyFor(tier);
  const destinations = policy.navItems <= KIDS_DESTINATIONS.length
    ? KIDS_DESTINATIONS
    : ALL_DESTINATIONS;

  return (
    <div className={styles.shell} data-tier={tier}>
      <div className={styles.main}>
        {header === undefined ? null : <div className={styles.header}>{header}</div>}
        <div className={styles.content}>{children}</div>
      </div>
      <div className={styles.navArea}>
        <ShellNav
          destinations={destinations}
          active={active}
          items={items}
          variant="responsive"
        />
      </div>
    </div>
  );
}
