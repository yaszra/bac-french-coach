"use client";

import { useSurface } from "@/modules/design/theme/ThemeProvider";
import { EmptyState } from "@/modules/design/ui/display";

/**
 * No corpus in this checkout. The honest state — not an error, not a zero, and
 * certainly not a page of invented Arabic.
 */
export function MushafFallback() {
  const { t } = useSurface();
  return <EmptyState variant="not-yet-recorded" title={t("state.notYetRecorded")} />;
}
