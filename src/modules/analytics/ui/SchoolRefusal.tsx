"use client";

import { useSurface } from "../../design/theme/ThemeProvider";
import { EmptyState } from "../../design/ui/display";
import styles from "./school.module.css";

/** Said plainly, without hinting at what the numbers behind it would be. */
export function SchoolRefusal({ reasonKey }: { readonly reasonKey: string }) {
  const { t } = useSurface();
  return (
    <div className={styles.page}>
      <EmptyState title={t("school.title")} description={t(reasonKey)} />
    </div>
  );
}
