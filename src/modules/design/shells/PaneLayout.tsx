import type { ReactNode } from "react";
import styles from "./PaneLayout.module.css";

export type PaneCount = 1 | 2 | 3;

export type PaneLayoutProps = {
  /** The muṣḥaf page — always the first pane, always the largest. */
  readonly page: ReactNode;
  /** The exercise tray: below the page on a phone, beside it from 700px. */
  readonly exercise?: ReactNode | undefined;
  /** Context (teacher notes, meters). Third pane only, from 1100px. */
  readonly context?: ReactNode | undefined;
  /** One obvious next action, pinned above the fold on a phone. */
  readonly actionRow?: ReactNode | undefined;
  /** `auto` follows the container width; a number pins the layout. */
  readonly panes?: PaneCount | "auto" | undefined;
};

/**
 * The practice layout: one, two or three bounded panes.
 *
 * The document itself never scrolls here — each pane owns its overflow, so a
 * thumb on the tray can never drag the muṣḥaf page off the screen.
 */
export function PaneLayout({ page, exercise, context, actionRow, panes = "auto" }: PaneLayoutProps) {
  return (
    <div className={styles.layout}>
      <div className={styles.panes} data-panes={panes}>
        <section className={styles.pane}>{page}</section>
        {exercise === undefined ? null : <section className={styles.pane}>{exercise}</section>}
        {context === undefined ? null : (
          <aside className={`${styles.pane} ${styles.context}`}>{context}</aside>
        )}
      </div>
      {actionRow === undefined ? null : <div className={styles.actionRow}>{actionRow}</div>}
    </div>
  );
}
