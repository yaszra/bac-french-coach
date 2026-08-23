import type { ReactNode } from "react";

/**
 * A destination in a shell's navigation.
 *
 * Shells carry layout and navigation only. `href` renders a link, `onSelect`
 * renders a button; the shell decides nothing about what either one does.
 */
export type ShellNavItem<Id extends string> = {
  readonly id: Id;
  readonly href?: string | undefined;
  readonly onSelect?: (() => void) | undefined;
  /** A count or mark beside the label — supplied, never computed here. */
  readonly badge?: ReactNode | undefined;
};
