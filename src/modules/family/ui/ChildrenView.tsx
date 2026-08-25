"use client";

import { useSurface } from "../../design/theme/ThemeProvider";
import { LinkButton } from "../../design/ui/controls";
import { Badge, EmptyState } from "../../design/ui/display";
import { PENDING_CLAIM_VISIBILITY } from "../domain/claim";
import type { ChildLink } from "../repo/family-repo";
import styles from "./family.module.css";

/**
 * The children a guardian is linked to — and, for a claim still waiting, an
 * honest statement of what that link does and does not open.
 */
export function ChildrenView({ links }: { readonly links: readonly ChildLink[] }) {
  const { t } = useSurface();

  if (links.length === 0) {
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

  return (
    <div className={styles.stack}>
      {links.map((child) => (
        <section key={child.learnerUserId} className={styles.card}>
          <div className={styles.rowBetween}>
            <h2 className={styles.headline}>{child.displayName}</h2>
            <Badge tone={child.state === "approved" ? "success" : "caution"} dot>
              {t(child.state === "approved" ? "family.children.approved" : "family.children.pending")}
            </Badge>
          </div>

          <p className={styles.quiet}>
            {child.classroomName === null
              ? t("family.children.noClassroom")
              : t("family.children.inClassroom", { classroom: child.classroomName })}
          </p>

          {child.state === "approved" ? (
            <>
              <p className={styles.sentence}>
                {t(child.canTutor ? "family.children.canTutor" : "family.children.cannotTutor")}
              </p>
              <div className={styles.actions}>
                <LinkButton href={`/tonight?child=${child.learnerUserId}`} variant="primary">
                  {t("family.children.openTonight")}
                </LinkButton>
              </div>
            </>
          ) : (
            <PendingClaim childName={child.displayName} />
          )}
        </section>
      ))}

      <div className={styles.actions}>
        <LinkButton href="/link">{t("family.children.add")}</LinkButton>
      </div>
    </div>
  );
}

/**
 * A claim is not access. This panel exists so the screen never implies that it
 * is: what a pending guardian may see is listed, and what they may not see is
 * listed beside it, in the same type size.
 */
export function PendingClaim({ childName }: { readonly childName: string }) {
  const { t } = useSurface();
  return (
    <div className={styles.stack}>
      <p className={styles.sentence}>{t("family.claim.waitingForTeacher", { child: childName })}</p>
      <div className={styles.subBlock}>
        <p className={styles.eyebrow}>{t("family.claim.canSee")}</p>
        <ul className={styles.tickList}>
          {PENDING_CLAIM_VISIBILITY.visible.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>
      <div className={styles.subBlock}>
        <p className={styles.eyebrow}>{t("family.claim.cannotSee")}</p>
        <ul className={styles.tickList}>
          {PENDING_CLAIM_VISIBILITY.hidden.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
