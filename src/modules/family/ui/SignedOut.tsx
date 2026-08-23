"use client";

import { useSurface } from "../../design/theme/ThemeProvider";
import { EmptyState } from "../../design/ui/display";
import { LinkButton } from "../../design/ui/controls";

/** A signed-out guardian is told what this app is for, and nothing about a child. */
export function SignedOut() {
  const { t } = useSurface();
  return (
    <EmptyState
      title={t("family.signedOut.title")}
      description={t("family.signedOut.description")}
      action={<LinkButton href="/sign-in" variant="primary">{t("family.signedOut.title")}</LinkButton>}
    />
  );
}
