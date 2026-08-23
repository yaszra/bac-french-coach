import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { LearnerShell } from "@/modules/design/shells";
import { LinkButton } from "@/modules/design/ui/controls";
import { Badge, EmptyState } from "@/modules/design/ui/display";
import { Lantern } from "@/modules/design/ui/feedback";
import { translator, type Translate } from "@/modules/platform/i18n/translate";
import { getTodayPlan, todayHeadline, type TodayPlan } from "@/modules/memory/actions/today-plan";
import { headlineOf, kidStepFor, KID_STEPS, type KidStep } from "@/modules/hifz/ui/plan-shape";
import { inkDepthOf } from "@/modules/hifz/ui/ink-depth";
import { practiceHref } from "../practice/href";
import { PrimaryCard } from "./PrimaryCard";
import { SyncBanner } from "../SyncBanner";
import styles from "./today.module.css";

/**
 * Today — the five-second screen.
 *
 * The tier changes what surrounds the action, never what the action IS: the
 * engine ranked the same board for all three, and a child and an adult are asked
 * for the same evidence. What differs is the register — a child gets three doors
 * and a lantern, a teenager a goal and a forgiving streak, an adult the rhythm of
 * new, recent and old.
 *
 * No XP anywhere, on any tier.
 */
export default async function TodayPage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/sign-in");
  const actor = caller.actor;
  const t = translator(actor.locale);

  const plan = await getTodayPlan(actor.organizationId, actor.userId);
  const headline = todayHeadline(plan);

  return (
    <LearnerShell active="today" items={LEARNER_NAV}>
      <div className={styles.page}>
        <div className={styles.inner}>
          <header>
            <p className={styles.eyebrow}>{t("learner.today.title")}</p>
            <h1 className={styles.greeting}>
              {t("learner.today.greeting", { name: plan.displayName || actor.displayName })}
            </h1>
          </header>

          <SyncBanner />

          {headline.kind === "action" ? (
            <PrimaryCard primary={headline.primary} remainingSteps={headline.remainingSteps} t={t} />
          ) : (
            <NothingDue plan={plan} t={t} />
          )}

          {plan.tier === "kids" ? (
            <KidsRhythm plan={plan} t={t} />
          ) : plan.tier === "teen" ? (
            <TeenRhythm plan={plan} t={t} />
          ) : (
            <AdultRhythm plan={plan} t={t} />
          )}
        </div>
      </div>
    </LearnerShell>
  );
}

const LEARNER_NAV = [
  { id: "today" as const, href: "/today" },
  { id: "quran" as const, href: "/quran" },
  { id: "reading" as const, href: "/reading" },
  { id: "practice" as const, href: "/practice" },
  { id: "me" as const, href: "/me" },
];

/**
 * Nothing due.
 *
 * Said plainly, with the engine's reason, and followed by an offer to READ —
 * which records nothing and is not evidence. It is never followed by invented
 * work, and never by an apology for an empty day.
 */
function NothingDue({ plan, t }: { readonly plan: TodayPlan; readonly t: Translate }) {
  const headline = headlineOf(plan.plan, { canReadForMaintenance: plan.canReadForMaintenance });
  if (headline.kind !== "nothing_due") return null;

  if (!plan.hasAssignment) {
    return (
      <EmptyState
        variant="empty"
        title={t("learner.today.askGrownUp.title")}
        description={t(plan.tier === "kids" ? "learner.today.askGrownUp.kids" : "learner.today.askGrownUp.body")}
        data-testid="today-empty"
      />
    );
  }

  const isNothingDue = headline.reasonKey === "hifz.plan.nothing_due";
  return (
    <div className={styles.panel} data-testid="today-nothing-due">
      <EmptyState
        variant="not-yet-recorded"
        title={t(isNothingDue ? "learner.today.nothingDue.title" : "learner.today.nothingFits.title")}
        description={t(isNothingDue ? "learner.today.nothingDue.body" : "learner.today.nothingFits.body")}
        {...(headline.offersMaintenance
          ? {
              action: (
                <LinkButton href="/quran?view=read" variant="secondary">
                  {t("learner.today.maintenance.action")}
                </LinkButton>
              ),
            }
          : {})}
      />
      {headline.offersMaintenance ? (
        <p className={styles.note}>{t("learner.today.maintenance.body")}</p>
      ) : null}
    </div>
  );
}

/**
 * A child's rhythm: three doors and a lantern.
 *
 * No counts, no streak, no timer, no score — by tier policy and by the honesty
 * rule both. The lantern is the only progress language on this screen, and its
 * light is the same ink depth the page uses.
 */
function KidsRhythm({ plan, t }: { readonly plan: TodayPlan; readonly t: Translate }) {
  const step = plan.plan.kind === "plan" ? plan.plan.firstAction : null;
  const activeStep: KidStep | null = step === null ? null : kidStepFor(step.exercise);
  const state = step === null ? undefined : plan.states.find((row) => row.unitId === step.unitId);
  const depth = inkDepthOf(state, plan.now);

  return (
    <div className={styles.kids}>
      <div className={styles.kidsLantern}>
        <Lantern depth={depth} size="lg" label={t("learner.kids.lantern")} />
      </div>

      <div className={styles.kidsSteps}>
        {KID_STEPS.map((name, index) => (
          <a
            key={name}
            className={styles.kidsStep}
            data-active={activeStep === name ? "true" : "false"}
            href={step === null ? "/today" : practiceHref({ unitId: step.unitId })}
            aria-disabled={activeStep === name ? undefined : "true"}
            aria-current={activeStep === name ? "step" : undefined}
          >
            <span className={styles.kidsIndex} aria-hidden="true">
              {index + 1}
            </span>
            {t(`learner.kids.step.${name}`)}
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * A teenager's rhythm: a goal, and a streak with grace.
 *
 * The streak never shows a gap, a red mark or a broken chain. A missed day is
 * spent from an allowance and said out loud as forgiveness — which is the only
 * version of a streak that belongs anywhere near memorising scripture.
 */
function TeenRhythm({ plan, t }: { readonly plan: TodayPlan; readonly t: Translate }) {
  return (
    <div className={styles.panel} data-testid="today-teen-rhythm">
      <p className={styles.panelTitle}>{t("learner.today.goal.label")}</p>
      <div className={styles.row}>
        {plan.goal.kind === "not_set" ? (
          <span>{t("learner.today.goal.notSet")}</span>
        ) : (
          <>
            <span data-testid="today-goal">
              {t("learner.today.doneToday", {
                done: plan.goal.progress.done,
                total: plan.goal.progress.total,
              })}
            </span>
            {plan.goal.met ? <Badge tone="success">{t("learner.today.goal.met")}</Badge> : null}
          </>
        )}
      </div>

      <div className={styles.row} data-testid="today-streak">
        <span>
          {plan.streak.days === 0
            ? t("learner.today.streak.none")
            : t("learner.today.streak.label", { count: plan.streak.days })}
        </span>
        {plan.streak.restingToday ? <span>{t("learner.today.streak.resting")}</span> : null}
      </div>
      {plan.streak.graceUsed > 0 ? <p className={styles.note}>{t("learner.today.streak.grace")}</p> : null}

      <DueRow plan={plan} t={t} />
    </div>
  );
}

/** An adult's rhythm: the three streams, each one a door into the workspace. */
function AdultRhythm({ plan, t }: { readonly plan: TodayPlan; readonly t: Translate }) {
  return (
    <div className={styles.panel} data-testid="today-streams">
      <p className={styles.panelTitle}>{t("learner.today.streams.title")}</p>
      <div className={styles.streams}>
        {(["new", "recent", "old"] as const).map((stream) => (
          <a
            key={stream}
            className={styles.stream}
            data-empty={plan.streams[stream] === 0 ? "true" : "false"}
            href={practiceHref({ stream })}
            aria-label={t("learner.today.streams.open", { stream: t(`learner.today.streams.${stream}`) })}
          >
            <span className={styles.streamCount}>{plan.streams[stream]}</span>
            <span className={styles.streamName}>{t(`learner.today.streams.${stream}`)}</span>
          </a>
        ))}
      </div>
      <DueRow plan={plan} t={t} />
    </div>
  );
}

/**
 * The due count, never without its denominator.
 *
 * When nothing has been recorded today the denominator is nothing, and the row
 * says "not yet recorded" instead of a confident 0 of 0.
 */
function DueRow({ plan, t }: { readonly plan: TodayPlan; readonly t: Translate }) {
  return (
    <div className={styles.row}>
      <span data-testid="today-due">
        {plan.due.hasDenominator
          ? t("learner.today.doneToday", { done: plan.due.done, total: plan.due.total })
          : t("learner.today.nothingRecordedYet")}
      </span>
      {plan.awaitingTeacher > 0 ? (
        <Badge tone="caution">
          {t("learner.today.awaitingTeacher", { count: plan.awaitingTeacher })}
        </Badge>
      ) : null}
    </div>
  );
}
