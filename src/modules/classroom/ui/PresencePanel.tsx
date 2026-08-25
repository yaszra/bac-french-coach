"use client";

import { Badge } from "../../design/ui/display";
import { useSurface } from "../../design/theme/ThemeProvider";
import { usePresence } from "./usePresence";
import styles from "./TeacherConsole.module.css";

/**
 * Who is working right now.
 *
 * The roster comes from the server so the panel is complete before the stream
 * says anything: a learner nobody has heard from is "not here", which is a
 * state, rather than a missing row, which reads as a missing student.
 */
export type PresencePanelProps = {
  readonly classroomId: string;
  readonly roster: readonly { readonly userId: string; readonly displayName: string }[];
};

const TONE = { working: "success", idle: "caution", away: "neutral" } as const;

export function PresencePanel({ classroomId, roster }: PresencePanelProps) {
  const { t } = useSurface();
  const feed = usePresence(classroomId);
  const byId = new Map(feed.entries.map((entry) => [entry.learnerUserId, entry]));
  const working = feed.entries.filter((entry) => entry.state === "working").length;

  return (
    <section className={styles.card} aria-labelledby="presence-heading">
      <h2 className={styles.sectionTitle} id="presence-heading">
        {t("teacher.presence.heading")}
      </h2>
      <p className={styles.sectionNote}>
        {feed.status === "connecting"
          ? t("teacher.presence.connecting")
          : feed.status === "lost"
            ? t("teacher.presence.lost")
            : t("teacher.presence.working", { count: working, total: roster.length })}
      </p>
      <ul className={styles.checklist}>
        {roster.map((learner) => {
          const entry = byId.get(learner.userId);
          const state = entry?.state ?? "away";
          return (
            <li key={learner.userId} className={styles.checkRow} data-state={state}>
              <Badge tone={TONE[state]} dot>
                {t(`teacher.presence.state.${state}`)}
              </Badge>
              <span className={styles.checkLabel}>{learner.displayName}</span>
            </li>
          );
        })}
      </ul>
      <p className={styles.meta}>{t("teacher.presence.notTelemetry")}</p>
    </section>
  );
}
