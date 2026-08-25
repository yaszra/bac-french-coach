import { redirect } from "next/navigation";

import { getCaller } from "@/modules/identity/actions/session-context";
import { LearnerShell } from "@/modules/design/shells";
import { LinkButton } from "@/modules/design/ui/controls";
import { Badge, EmptyState } from "@/modules/design/ui/display";
import { translator, type Translate } from "@/modules/platform/i18n/translate";
import { getReadingPath, type ReadingPathView } from "@/modules/reading/actions/reading-session";
import type { LessonProgress } from "@/modules/reading/ui/path-shape";
import styles from "@/modules/reading/ui/reading.module.css";

import { LEARNER_NAV } from "../nav";
import { lessonHref, readingHref, reviewHref } from "./href";

/**
 * Reading — where the learner stands on the Qāʿidah.
 *
 * Three things, in this order: the one next action, the path, and nothing else
 * competing with either. The counts are all counts — "{done} of {total}" — because a
 * percentage over an empty denominator is the exact shape of a comfortable lie, and a
 * lesson nobody has touched says "not yet recorded" rather than 0%.
 */
export default async function ReadingPage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/sign-in");
  const actor = caller.actor;
  const t = translator(actor.locale);
  const tier = actor.tier ?? "adult";

  const view = await getReadingPath(actor.organizationId, actor.userId, tier);

  const shell = (children: React.ReactNode) => (
    <LearnerShell active="reading" items={LEARNER_NAV}>
      {children}
    </LearnerShell>
  );

  if (view.packageMissing) {
    return shell(
      <div className={styles.page}>
        <div className={styles.inner}>
          <EmptyState
            variant="not-yet-recorded"
            title={t("reading.path.packageMissing.title")}
            description={t("reading.path.packageMissing.body")}
            data-testid="reading-package-missing"
          />
        </div>
      </div>,
    );
  }

  return shell(
    <div className={styles.page}>
      <div className={styles.inner} data-testid="reading-path">
        <header>
          <h1 className={styles.heading}>{t("reading.title")}</h1>
          <p className={styles.lede}>{t("reading.subtitle")}</p>
          <p className={styles.quiet} data-testid="reading-recorded">
            {view.path.recordedConcepts === 0
              ? t("reading.path.nothingRecorded")
              : t("reading.path.recorded", {
                  done: view.path.recordedConcepts,
                  total: view.path.totalConcepts,
                })}
          </p>
        </header>

        <NextAction view={view} t={t} />

        <section className={styles.panel} aria-labelledby="reading-path-heading">
          <p className={styles.panelTitle} id="reading-path-heading">
            {t("reading.path.heading")}
          </p>
          <div className={styles.lessons}>
            {view.path.lessons.map((entry, index) => (
              <LessonRow key={entry.lesson.id} entry={entry} index={index + 1} t={t} />
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <p className={styles.panelTitle}>{t("reading.letters.title")}</p>
          <p className={styles.note}>{t("reading.letters.body")}</p>
          <div className={styles.actions}>
            <LinkButton href={`${readingHref()}/letters`} variant="secondary" data-testid="reading-letters-link">
              {t("reading.letters.open")}
            </LinkButton>
          </div>
        </section>
      </div>
    </div>,
  );
}

/**
 * The one obvious next action.
 *
 * Review outranks new material — a concept that has come round is the work, and
 * burying it under a new lesson is how a primer quietly turns into a treadmill. When
 * there is genuinely nothing, that is what it says.
 */
function NextAction({ view, t }: { readonly view: ReadingPathView; readonly t: Translate }) {
  const next = view.path.next;

  if (next.kind === "nothing_due") {
    return (
      <div className={styles.primary} data-testid="reading-next-nothing">
        <p className={styles.primaryTitle}>{t("reading.next.nothingDue.title")}</p>
        <p className={styles.note}>{t("reading.next.nothingDue.body")}</p>
        <div className={styles.actions}>
          <LinkButton href={`${readingHref()}/letters`} variant="secondary">
            {t("reading.letters.open")}
          </LinkButton>
        </div>
      </div>
    );
  }

  if (next.kind === "review") {
    return (
      <div className={styles.primary} data-testid="reading-next-review">
        <p className={styles.eyebrow}>{t("reading.next.heading")}</p>
        <p className={styles.primaryTitle}>{t("reading.next.review.title")}</p>
        <p className={styles.note}>{t("reading.next.review.body", { count: next.due })}</p>
        <div className={styles.actions}>
          <LinkButton href={reviewHref()} variant="primary" data-testid="reading-start">
            {t("reading.review.title")}
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.primary} data-testid="reading-next-lesson">
      <p className={styles.eyebrow}>{t("reading.next.heading")}</p>
      <p className={styles.primaryTitle}>{t(next.lesson.lesson.titleKey)}</p>
      <p className={styles.note}>{t("reading.next.lesson.body")}</p>
      <div className={styles.actions}>
        <LinkButton
          href={lessonHref(next.lesson.lesson.id)}
          variant="primary"
          data-testid="reading-start"
        >
          {t("reading.next.lesson.open")}
        </LinkButton>
      </div>
    </div>
  );
}

/** One lesson: its state, its counts, and — when locked — what it waits on. */
function LessonRow({
  entry,
  index,
  t,
}: {
  readonly entry: LessonProgress;
  readonly index: number;
  readonly t: Translate;
}) {
  const blocker = entry.blockedBy[0];
  const body = (
    <>
      <span className={styles.lessonIndex} aria-hidden="true">
        {index}
      </span>
      <span className={styles.lessonName}>
        <span className={styles.lessonTitle}>{t(entry.lesson.titleKey)}</span>
        <span className={styles.quiet}>
          {entry.recorded === 0
            ? t("reading.path.conceptsIn", { total: entry.total, count: entry.total })
            : t("reading.path.secureCount", { secure: entry.secure, total: entry.total })}
        </span>
        {entry.unlocked ? null : (
          <span className={styles.quiet}>
            {t("reading.lessonState.locked", {
              lesson: blocker === undefined ? t("reading.lesson.unknown") : t(`reading.lesson.${blocker}`),
            })}
          </span>
        )}
      </span>
      <span className={styles.row}>
        {entry.due > 0 ? <Badge tone="accent">{t("reading.path.dueHere", { count: entry.due })}</Badge> : null}
        <Badge tone={entry.state === "secure" ? "success" : "neutral"}>
          {t(`reading.lessonState.${entry.state}`)}
        </Badge>
      </span>
    </>
  );

  if (!entry.unlocked) {
    return (
      <div className={styles.lesson} data-locked="true" data-state={entry.state} data-testid="reading-lesson">
        {body}
      </div>
    );
  }

  return (
    <a
      className={styles.lesson}
      href={lessonHref(entry.lesson.id)}
      data-locked="false"
      data-state={entry.state}
      data-testid="reading-lesson"
    >
      {body}
    </a>
  );
}
