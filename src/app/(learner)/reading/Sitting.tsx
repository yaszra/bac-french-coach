import { LearnerShell } from "@/modules/design/shells";
import { LinkButton } from "@/modules/design/ui/controls";
import { EmptyState } from "@/modules/design/ui/display";
import { policyFor } from "@/modules/design/theme/tier";
import type { Translate } from "@/modules/platform/i18n/translate";

import type { ReadingSittingView } from "@/modules/reading/actions/reading-session";
import { LessonRunner } from "@/modules/reading/ui/LessonRunner";
import { LadderTrack, ScoreLine } from "@/modules/reading/ui/LadderTrack";
import { conceptLabel } from "@/modules/reading/ui/concept-label";
import type { NarrationSegmentView } from "@/modules/reading/ui/Narration";
import type { TalqinView } from "@/modules/reading/ui/TalqinPlayer";
import styles from "@/modules/reading/ui/reading.module.css";

import { LEARNER_NAV } from "../nav";
import { readingHref } from "./href";

/**
 * A sitting, rendered.
 *
 * Both the lesson and the review screens are the same shape — the planner decided what
 * is in this one — so they share this. The server has already settled everything that
 * can be settled: which items, in which order, with which choices, and what is known
 * about each concept. The client is left with nothing to decide except what the
 * learner did.
 *
 * The tier changes the register, never the evidence. Children get no numbers and no
 * ladder detail; a teenager and an adult see where each concept stands, with its
 * denominator.
 */
export function Sitting({
  view,
  learnerUserId,
  title,
  emptyTitle,
  emptyBody,
  narration,
  t,
}: {
  readonly view: ReadingSittingView;
  readonly learnerUserId: string;
  readonly title: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  readonly narration: readonly NarrationSegmentView[];
  readonly t: Translate;
}) {
  const policy = policyFor(view.tier);

  const talqin: Record<string, TalqinView> = {};
  for (const [conceptId, resolution] of view.talqin) {
    if (resolution.kind === "not_yet_recorded") {
      talqin[conceptId] = { kind: "not_yet_recorded", reasonKey: resolution.reason.key };
      continue;
    }
    const src = view.talqinSrc.get(resolution.asset.assetId);
    talqin[conceptId] =
      src === undefined
        ? { kind: "not_yet_recorded", reasonKey: "reading.talqin.reason.not_yet_recorded" }
        : {
            kind: "resolved",
            src,
            provenanceLabelKey: resolution.provenanceLabelKey,
            isMachineVoice: resolution.isMachineVoice,
          };
  }

  const conceptsInSitting = [...new Set(view.items.map((item) => item.conceptId))];
  const statesShown = view.states.filter((state) => conceptsInSitting.includes(state.conceptId));

  return (
    <LearnerShell active="reading" items={LEARNER_NAV}>
      <div className={styles.page}>
        <div className={styles.inner} data-testid="reading-sitting">
          <header>
            <p className={styles.eyebrow}>{t("reading.title")}</p>
            <h1 className={styles.heading}>{title}</h1>
          </header>

          {view.items.length === 0 ? (
            <EmptyState
              variant="not-yet-recorded"
              title={emptyTitle}
              // The planner's own reason is the better answer when it actually looked
              // at something; when there was nothing to look at, the screen's own
              // words are truer than "this lesson has nothing in it".
              description={
                view.plan.emptyReason === null || view.states.length === 0
                  ? emptyBody
                  : t(emptyKeyOf(view.plan.emptyReason.key))
              }
              action={
                <LinkButton href={readingHref()} variant="secondary">
                  {t("reading.action.backToPath")}
                </LinkButton>
              }
              data-testid="reading-sitting-empty"
            />
          ) : (
            <LessonRunner
              learnerUserId={learnerUserId}
              items={view.items}
              talqin={talqin}
              narration={narration}
              doneHref={readingHref()}
              hasTeacher={view.hasTeacher}
            />
          )}

          {/* Children are shown no scores and no ladder arithmetic — tier policy. */}
          {view.tier === "kids"
            ? null
            : statesShown.map((state) => (
                <section key={state.conceptId} className={styles.panel} data-testid="reading-concept-state">
                  <p className={styles.lessonTitle}>{conceptLabel(t, state.conceptId)}</p>
                  <ScoreLine score={state.smartScore} t={t} showNumber={policy.showsScores} />
                  <LadderTrack ladder={state.ladder} t={t} />
                </section>
              ))}
        </div>
      </div>
    </LearnerShell>
  );
}

/** The planner's empty reasons already have message keys; this is the namespace. */
function emptyKeyOf(reasonKey: string): string {
  return reasonKey.startsWith("reading.") ? reasonKey : `reading.${reasonKey}`;
}
