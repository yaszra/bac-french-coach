"use client";

import { useSurface } from "../../design/theme/ThemeProvider";
import { EmptyState } from "../../design/ui/display";
import { LinkButton } from "../../design/ui/controls";
import styles from "./family.module.css";

export type TutorableChild = {
  readonly learnerUserId: string;
  readonly displayName: string;
};

export type WaitingRequest = {
  readonly id: string;
  readonly learnerName: string;
  readonly waitingHours: number;
  /** References only — "78:1–5" — or null when the scope is not a passage. */
  readonly scopeLabel: string | null;
};

/**
 * The tutoring queue, and the three honest things it can say.
 *
 * A guardian may be tutoring nobody, may be tutoring someone with nothing
 * waiting, or may have someone to hear. Those are different sentences, and
 * collapsing the first two into one empty list would tell a parent who has not
 * been granted tutoring that their child simply has nothing to recite.
 */
export function TutoringList({
  tutorable,
  hasChildren,
  waiting,
}: {
  readonly tutorable: readonly TutorableChild[];
  readonly hasChildren: boolean;
  readonly waiting: readonly WaitingRequest[];
}) {
  const { t } = useSurface();

  if (tutorable.length === 0) {
    return (
      <EmptyState
        variant="not-yet-recorded"
        title={t("family.tutor.notGranted")}
        description={t(
          hasChildren ? "family.tutor.notGrantedHelp" : "family.tutor.noChildrenHelp",
        )}
        action={
          <LinkButton href="/children" variant="secondary">
            {t("family.tutor.seeChildren")}
          </LinkButton>
        }
      />
    );
  }

  if (waiting.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title={t("family.tutor.nobodyWaiting")}
        description={t("family.tutor.nobodyWaitingHelp", {
          names: tutorable.map((child) => child.displayName).join(", "),
        })}
      />
    );
  }

  return (
    <div className={styles.stack}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>{t("family.tutor.queue")}</p>
        <ul className={styles.list}>
          {waiting.map((request) => (
            <li key={request.id} className={styles.listItem}>
              <span className={styles.sentence}>
                {t("family.tutor.waitingFor", {
                  name: request.learnerName,
                  hours: request.waitingHours,
                })}
                {request.scopeLabel === null ? "" : ` · ${request.scopeLabel}`}
              </span>
              <LinkButton href={`/tutor/${request.id}`} variant="primary">
                {t("family.tutor.listen")}
              </LinkButton>
            </li>
          ))}
        </ul>
      </section>
      <p className={styles.note}>{t("family.tutor.sameBar")}</p>
    </div>
  );
}
