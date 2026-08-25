"use client";

import { useSurface } from "../../theme/ThemeProvider";
import styles from "./InkLegend.module.css";

type LegendRow = { readonly depth: 5 | 2 | 0; readonly key: string };

const ROWS: readonly LegendRow[] = [
  { depth: 5, key: "progress.held" },
  { depth: 2, key: "progress.due" },
  { depth: 0, key: "progress.notEarned" },
];

/**
 * The ink language, said plainly: held, due for review, not yet earned.
 *
 * Honesty rule — the legend names the three states the ink can actually be in
 * and claims nothing else. It belongs in onboarding, never on the page.
 */
export function InkLegend() {
  const { t } = useSurface();
  return (
    <dl className={styles.legend}>
      {ROWS.map((row) => (
        <div key={row.key} className={styles.row} data-depth={row.depth}>
          <dt className={styles.term}>{t(row.key)}</dt>
          <dd className={styles.chip} aria-hidden="true">
            <span className={styles.bar} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
