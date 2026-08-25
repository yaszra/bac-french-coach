"use client";

import { useSurface } from "../../design/theme/ThemeProvider";
import { EmptyState } from "../../design/ui/display";
import { LinkButton } from "../../design/ui/controls";
import { PendingClaim } from "./ChildrenView";
import styles from "./family.module.css";

/**
 * What a guardian sees where a report would be, when they may not see one.
 *
 * It never renders an empty report: "nothing here" and "you are not allowed to
 * see this yet" are different sentences, and showing the first for the second
 * would be the product lying quietly.
 */
export function PendingClaimNotice({
  childName,
  reason,
}: {
  readonly childName: string;
  readonly reason: string;
}) {
  const { t } = useSurface();

  if (reason === "claim_not_yet_approved" && childName) {
    return (
      <div className={styles.card}>
        <h2 className={styles.headline}>{t("family.claim.pendingTitle")}</h2>
        <PendingClaim childName={childName} />
      </div>
    );
  }

  return (
    <EmptyState
      title={t("family.children.none")}
      description={t("family.children.noneDescription")}
      action={
        <LinkButton href="/link" variant="primary">
          {t("family.children.add")}
        </LinkButton>
      }
    />
  );
}
