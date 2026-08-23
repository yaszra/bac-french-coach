import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { LearnerShell } from "@/modules/design/shells";
import { EmptyState } from "@/modules/design/ui/display";
import { LinkButton } from "@/modules/design/ui/controls";
import { translator } from "@/modules/platform/i18n/translate";
import { getAyah, pageOf, contentState } from "@/modules/content/domain/loader";
import { segmentWords } from "@/modules/hifz/ui/words";
import { getTodayPlan } from "@/modules/memory/actions/today-plan";
import { decideScaffold } from "@/modules/hifz/ui/scaffold-select";
import { ayahsOfUnit, unitReferenceLabel } from "@/modules/hifz/ui/passage";
import { reasonCopy } from "@/modules/hifz/ui/reason-copy";
import { inkDepthOf } from "@/modules/hifz/ui/ink-depth";
import { chooseGaps } from "@/modules/hifz/ui/rebuild";
import { streamOf, nextStepAfter, type Stream } from "@/modules/hifz/ui/plan-shape";
import { weakJoins, splitByKind } from "@/modules/hifz/domain/weakJoins";
import { ayahAudio, ayahTimings } from "@/modules/hifz/ui/audio-availability";
import { Workspace, type AudioPayload, type AyahPayload } from "./Workspace";
import { LEARNER_NAV } from "../nav";
import type { PlannedStep } from "@/modules/hifz/domain/sessionPlan";
import type { PracticeMode } from "@/modules/hifz/ui/scaffold-select";

/**
 * The workspace's server half.
 *
 * It decides four things and hands them down, already settled: which step this
 * is, what the scaffold should be, which words the content package actually
 * holds, and whether there is a recitation to play. The client is then left with
 * nothing to decide except what the learner did — which is the only thing a
 * client is trusted with.
 */
export default async function PracticePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/sign-in");
  const actor = caller.actor;
  const t = translator(actor.locale);
  const params = await searchParams;

  const mode: PracticeMode = first(params.mode) === "test" ? "test" : "practice";
  const requestedUnit = first(params.unit);
  const requestedStream = asStream(first(params.stream));

  const plan = await getTodayPlan(actor.organizationId, actor.userId);

  const shell = (children: React.ReactNode) => (
    <LearnerShell active="practice" items={LEARNER_NAV}>
      {children}
    </LearnerShell>
  );

  if (plan.plan.kind !== "plan") {
    return shell(
      <EmptyState
        variant="not-yet-recorded"
        title={t("learner.today.nothingDue.title")}
        description={t("learner.today.nothingDue.body")}
        action={
          <LinkButton href="/today" variant="secondary">
            {t("learner.practice.backToToday")}
          </LinkButton>
        }
      />,
    );
  }

  const byUnit = new Map(plan.states.map((state) => [state.unitId, state]));
  const step = pickStep(plan.plan.steps, requestedUnit, requestedStream, byUnit);

  if (step === null) {
    return shell(
      <EmptyState
        variant="empty"
        title={t("learner.today.streams.empty")}
        description={t("learner.today.nothingDue.body")}
        action={
          <LinkButton href="/today" variant="secondary">
            {t("learner.practice.backToToday")}
          </LinkButton>
        }
      />,
    );
  }

  // The content package, or the honest absence of it. A missing package is a
  // state the screen renders; it is never filled in.
  const refs = ayahsOfUnit(step.unitId);
  const state = byUnit.get(step.unitId);
  const ayahs: readonly AyahPayload[] = refs.flatMap((ref) => {
    const verse = getAyah(ref.surah, ref.ayah);
    if (verse === null) return [];
    const unitState = byUnit.get(`b:${ref.surah}:${ref.ayah}`) ?? state;
    return [
      {
        ayah: ref.ayah,
        words: segmentWords(verse.text),
        depth: inkDepthOf(unitState, plan.now),
      },
    ];
  });

  if (ayahs.length === 0 || contentState().kind !== "loaded") {
    return shell(
      <EmptyState
        variant="not-yet-recorded"
        title={t("learner.quran.notYetRecorded.title")}
        description={t("learner.quran.notYetRecorded.body")}
        action={
          <LinkButton href="/today" variant="secondary">
            {t("learner.practice.backToToday")}
          </LinkButton>
        }
      />,
    );
  }

  const scaffold = decideScaffold({
    exercise: step.exercise,
    mode,
    state,
    now: plan.now,
  });

  const target = ayahs[ayahs.length - 1];
  const anchor = refs[refs.length - 1];

  // The gaps land on the seams this learner is actually weak at, when the engine
  // has found any; otherwise they are spread across the āyah.
  const split = splitByKind(plan.states);
  const weak = weakJoins({ now: plan.now, transitions: split.transitions, bodies: split.bodies, limit: 5 });
  const preferredGaps = weak.length > 0 ? [1] : [];

  const audio: AudioPayload =
    anchor === undefined
      ? { kind: "not_yet_recorded" }
      : toPayload(ayahAudio(plan.reciterId, anchor.surah, anchor.ayah));

  const nextStep = nextStepAfter(plan.plan, step.unitId);

  return shell(
    <Workspace
      learnerUserId={actor.userId}
      unitId={step.unitId}
      unitLabel={unitReferenceLabel(step.unitId) ?? step.unitId}
      exercise={step.exercise}
      mode={mode}
      scaffold={scaffold.level}
      scaffoldReasonKey={scaffoldReasonMessageKey(scaffold.reasonKey)}
      ayahs={ayahs}
      pageNumber={anchor === undefined ? null : pageOf(anchor.surah, anchor.ayah)}
      audio={audio}
      timings={ayahTimings()}
      stepOrder={step.order}
      totalSteps={plan.plan.steps.length}
      nextUnitId={nextStep?.unitId ?? null}
      gaps={chooseGaps(target?.words.length ?? 0, 2, seedFor(step.unitId), preferredGaps)}
      seed={seedFor(step.unitId)}
      reasonKey={reasonCopy(step.reason).key}
      reasonParams={reasonCopy(step.reason).params}
    />,
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function asStream(value: string | undefined): Stream | undefined {
  return value === "new" || value === "recent" || value === "old" ? value : undefined;
}

/**
 * Which step to run.
 *
 * A deep link is honoured only when the unit is actually in today's plan: a URL
 * cannot conjure work the scheduler did not choose. Otherwise the stream filter
 * applies, and otherwise it is simply the plan's first action.
 */
function pickStep(
  steps: readonly PlannedStep[],
  unitId: string | undefined,
  stream: Stream | undefined,
  states: ReadonlyMap<string, { readonly stability: number; readonly reps: number }>,
): PlannedStep | null {
  if (unitId !== undefined) {
    return steps.find((step) => step.unitId === unitId) ?? null;
  }
  if (stream !== undefined) {
    return (
      steps.find((step) => {
        const state = states.get(step.unitId);
        return (
          streamOf({
            unitId: step.unitId,
            action: step.action,
            stabilityDays: state === undefined || state.reps === 0 ? null : state.stability,
          }) === stream
        );
      }) ?? null
    );
  }
  return steps[0] ?? null;
}

/** A stable seed per unit, so a tray does not reshuffle on every re-render. */
function seedFor(unitId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < unitId.length; i += 1) {
    hash ^= unitId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function scaffoldReasonMessageKey(key: string): string {
  return key.replace("learner.scaffold.reason.", "learner.practice.scaffoldReason.");
}

function toPayload(availability: ReturnType<typeof ayahAudio>): AudioPayload {
  return availability.kind === "available"
    ? { kind: "available", src: availability.src }
    : { kind: "not_yet_recorded" };
}
