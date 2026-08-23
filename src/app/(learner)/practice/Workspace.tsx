"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSurface } from "@/modules/design/theme/ThemeProvider";
import { PaneLayout } from "@/modules/design/shells";
import { Button, LinkButton } from "@/modules/design/ui/controls";
import { Textarea } from "@/modules/design/ui/controls/Textarea";
import { Badge, EmptyState, Progress } from "@/modules/design/ui/display";
import { Tile } from "@/modules/design/ui/feedback";
import { MushafPage, PageFrame, type InkDepth } from "@/modules/design/ui/mushaf";
import { policyFor } from "@/modules/design/theme/tier";
import type { HifzExercise } from "@/modules/hifz/domain/exercises";
import type { AttemptEvidence } from "@/modules/hifz/domain/grading";
import type { ScaffoldLevel } from "@/modules/memory/domain/scaffold";
import type { PracticeMode } from "@/modules/hifz/ui/scaffold-select";
import { firstLetterSlice } from "@/modules/hifz/ui/scaffold-select";
import { buildPageModel, type AyahWords } from "@/modules/hifz/ui/page-model";
import { isComplete, place, rebuildEvidence, startRebuild, type RebuildState } from "@/modules/hifz/ui/rebuild";
import { submitOrQueue, type SubmitResult } from "@/modules/hifz/ui/submit-client";
import { exerciseInstructionKey, exerciseMessageKey } from "@/modules/hifz/ui/reason-copy";
import { SpokenPrompt } from "@/modules/hifz/ui/SpokenPrompt";
import { practiceHref } from "./href";
import styles from "./practice.module.css";

export type AyahPayload = {
  readonly ayah: number;
  readonly words: readonly string[];
  readonly depth: InkDepth;
};

export type AudioPayload =
  | { readonly kind: "not_yet_recorded" }
  | { readonly kind: "available"; readonly src: string };

export type WorkspaceProps = {
  readonly learnerUserId: string;
  readonly unitId: string;
  readonly unitLabel: string;
  readonly exercise: HifzExercise;
  readonly mode: PracticeMode;
  readonly scaffold: ScaffoldLevel;
  readonly scaffoldReasonKey: string;
  /** The āyāt this unit is about: one for a body, two for a join. */
  readonly ayahs: readonly AyahPayload[];
  readonly pageNumber: number | null;
  readonly audio: AudioPayload;
  /** Measured word timings. Empty means: play, and do not highlight. */
  readonly timings: readonly { readonly wordIndex: number; readonly startMs: number; readonly endMs: number }[];
  readonly stepOrder: number;
  readonly totalSteps: number;
  readonly nextUnitId: string | null;
  readonly gaps: readonly number[];
  readonly seed: number;
  /** The scheduler's own "why this?", carried through unchanged from the plan. */
  readonly reasonKey: string;
  readonly reasonParams: Readonly<Record<string, string | number>>;
};

/**
 * The workspace: one rung of the ladder, one screen state.
 *
 * The rule that shapes every branch below: **this component reports what
 * happened and never what it was worth.** Every rung ends by handing
 * observations to `submitOrQueue` — words placed, milliseconds elapsed, hints
 * taken — and the server grades them. There is no code path here that computes a
 * grade, and the submission schema has no field that could carry one.
 *
 * The layout is `PaneLayout`: page above the tray on a phone with a sticky action
 * row, page beside the tray from 700px, a third pane from 1100px. The document
 * itself never scrolls while someone is reciting.
 */
/**
 * When this rung started, read only from an event handler.
 *
 * The clock is started in an effect rather than during render: a render is not
 * an event, may happen more than once, and a start time captured there would
 * drift with every re-render — which would quietly corrupt the one latency the
 * server actually grades on.
 */
function useStartedAt(): () => number {
  const at = useRef<number | null>(null);
  useEffect(() => {
    at.current = Date.now();
  }, []);
  return useCallback(() => at.current ?? Date.now(), []);
}

export function Workspace(props: WorkspaceProps) {
  const { t, tier } = useSurface();
  const router = useRouter();
  const policy = policyFor(tier);

  const [committed, setCommitted] = useState(props.exercise !== "recall_first" && props.exercise !== "connect_chain");
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [busy, setBusy] = useState(false);

  const target = props.ayahs[props.ayahs.length - 1];
  const cue = props.ayahs.length > 1 ? props.ayahs[0] : undefined;

  const send = useCallback(
    async (evidence: AttemptEvidence) => {
      setBusy(true);
      try {
        const outcome = await submitOrQueue({
          learnerUserId: props.learnerUserId,
          unitId: props.unitId,
          evidence,
          scaffold: props.scaffold,
          nonce: Math.random().toString(36).slice(2),
          occurredAt: new Date(),
        });
        setResult(outcome);
        // Only ask the server for a fresh plan when the server actually has
        // something new. A queued attempt has not reached it, and refreshing
        // while offline throws away the screen the learner is looking at.
        if (outcome.kind === "recorded" || outcome.kind === "requires_human") {
          router.refresh();
        }
      } finally {
        setBusy(false);
      }
    },
    [props.learnerUserId, props.unitId, props.scaffold, router],
  );

  /* ------------------------------------------------------------- the page */

  const shownAyahs: readonly AyahWords[] = useMemo(() => {
    const revealAll = hints > 0;
    return props.ayahs.map((ayah) => {
      if (props.scaffold === "full_text" || revealAll) return ayah;
      if (props.scaffold === "first_letters") {
        // A SLICE of the content package's own words. Nothing is authored,
        // completed or substituted here.
        return { ...ayah, words: ayah.words.map(firstLetterSlice) };
      }
      // word_count and blank: keep the words' spaces so the line does not
      // reflow, and draw nothing in them.
      return { ...ayah, depth: 0 as InkDepth };
    });
  }, [props.ayahs, props.scaffold, hints]);

  // The page is being shown ON PURPOSE here — to listen along, or because a hint
  // was taken — so the words are revealed whatever depth they have earned.
  const model = useMemo(
    () => buildPageModel({ ayahs: shownAyahs, revealAll: props.scaffold === "full_text" || hints > 0 }),
    [shownAyahs, props.scaffold, hints],
  );
  const pageHidden = (props.scaffold === "blank" && hints === 0) || !committed;

  const page = pageHidden ? (
    <div className={styles.blankPage} data-testid="practice-blank-page">
      <p>{t("learner.practice.scaffold.blank")}</p>
      {props.mode === "test" || !committed ? null : (
        <Button variant="quiet" onClick={() => setHints((n) => n + 1)}>
          {t("learner.practice.reveal")}
        </Button>
      )}
    </div>
  ) : (
    <PageFrame page={props.pageNumber ?? 0} dense>
      <MushafPage lines={model.lines} />
    </PageFrame>
  );

  /* ----------------------------------------------------------- the tray */

  const tray = result !== null ? (
    <Result result={result} exercise={props.exercise} />
  ) : (
    <div className={styles.tray}>
      <p className={styles.instruction}>
        {t(exerciseInstructionKey(props.exercise))}{" "}
        <SpokenPrompt messageKey={exerciseInstructionKey(props.exercise)} label="learner.kids.hear" />
      </p>
      {props.mode === "test" ? (
        <p className={styles.notice} data-testid="practice-test-notice">
          {t("learner.practice.testMode.body")}
        </p>
      ) : (
        <p className={styles.quietNotice}>
          {t(`learner.practice.scaffold.${props.scaffold}`)} — {t(props.scaffoldReasonKey)}
        </p>
      )}

      {props.exercise === "listen" ? (
        <ListenRung
          audio={props.audio}
          hasTimings={props.timings.length > 0}
          words={target?.words.length ?? 0}
          busy={busy}
          onSubmit={send}
        />
      ) : props.exercise === "recall_first" ? (
        <RecallFirstRung
          expectedWordCount={target?.words.length ?? 1}
          allowsTextInput={policy.allowsTextInput}
          committed={committed}
          hints={hints}
          busy={busy}
          onCommit={() => setCommitted(true)}
          onSubmit={send}
        />
      ) : props.exercise === "rebuild" ? (
        <RebuildRung words={target?.words ?? []} seed={props.seed} busy={busy} onSubmit={send} />
      ) : props.exercise === "gap_fill" ? (
        <GapFillRung words={target?.words ?? []} gaps={props.gaps} busy={busy} onSubmit={send} />
      ) : props.exercise === "next_ayah_cue" ? (
        <NextAyahCueRung
          cueLabel={cue === undefined ? props.unitLabel : `${cue.ayah}`}
          unitLabel={props.unitLabel}
          hints={hints}
          busy={busy}
          
          onSubmit={send}
        />
      ) : props.exercise === "connect_chain" ? (
        <ConnectChainRung
          ayahs={props.ayahs.map((a) => a.ayah)}
          committed={committed}
          busy={busy}
          onCommit={() => setCommitted(true)}
          onSubmit={send}
        />
      ) : (
        <OralRecitationRung
          expectedWordCount={target?.words.length ?? 1}
          busy={busy}
          
          onSubmit={send}
        />
      )}
    </div>
  );

  // A rung with no recitation in the package cannot be performed at all. Rather
  // than leaving the learner at a dead end, the action row offers the next step —
  // and nothing is recorded for the step that could not happen.
  const blocked = props.exercise === "listen" && props.audio.kind === "not_yet_recorded";

  const actionRow = (
    <div className={styles.actions}>
      {result === null && blocked && props.nextUnitId !== null ? (
        <LinkButton
          href={practiceHref({ unitId: props.nextUnitId, ...(props.mode === "test" ? { mode: "test" as const } : {}) })}
          variant="secondary"
          fullWidth
          data-testid="practice-skip"
        >
          {t("learner.practice.next")}
        </LinkButton>
      ) : null}
      {result === null ? (
        <LinkButton href="/today" variant="quiet" fullWidth>
          {t("learner.practice.leave")}
        </LinkButton>
      ) : props.nextUnitId === null ? (
        <LinkButton href="/today" variant="primary" fullWidth data-testid="practice-finish">
          {t("learner.practice.finish")}
        </LinkButton>
      ) : (
        <LinkButton
          href={practiceHref({ unitId: props.nextUnitId, ...(props.mode === "test" ? { mode: "test" as const } : {}) })}
          variant="primary"
          fullWidth
          data-testid="practice-next"
        >
          {t("learner.practice.next")}
        </LinkButton>
      )}
    </div>
  );

  /**
   * The third pane: why this step, and what is on screen.
   *
   * It appears only where there is room for it (from 1100px), and it never
   * competes with the exercise — it is the explanation a learner can look at, not
   * one they have to read first.
   */
  const context = (
    <div className={styles.tray}>
      <p className={styles.instruction}>{t("learner.today.why")}</p>
      <p className={styles.quietNotice}>{t(props.reasonKey, props.reasonParams)}</p>
      <p className={styles.instruction}>{t(`learner.practice.scaffold.${props.scaffold}`)}</p>
      <p className={styles.quietNotice}>{t(props.scaffoldReasonKey)}</p>
      {model.linesAreMeasured ? null : (
        <p className={styles.quietNotice}>{t("learner.quran.packedLines")}</p>
      )}
    </div>
  );

  return (
    <div className={styles.shell}>
      <div className={styles.bar}>
        <div className={styles.barText}>
          <p className={styles.barTitle}>{t(exerciseMessageKey(props.exercise))}</p>
          {/* Children are never shown a count — not of steps, not of anything. */}
          <p className={styles.barMeta}>
            {t("learner.practice.unit", { unitId: props.unitLabel })}
            {policy.showsScores || tier !== "kids"
              ? ` · ${t("learner.practice.step", { order: props.stepOrder, total: props.totalSteps })}`
              : ""}
          </p>
        </div>
        {props.mode === "test" ? <Badge tone="caution">{t("learner.practice.testMode.title")}</Badge> : null}
      </div>
      <PaneLayout page={page} exercise={tray} context={context} actionRow={actionRow} />
    </div>
  );
}

/* ------------------------------------------------------------------ result */

/**
 * What happened, said plainly.
 *
 * `requires_human` is the one that matters: it is presented as "your teacher will
 * listen", never as a pass, because nothing has been decided yet. A queued
 * attempt is "waiting to sync" — also not a pass.
 */
function Result({ result, exercise }: { readonly result: SubmitResult; readonly exercise: HifzExercise }) {
  const { t } = useSurface();
  if (result.kind === "requires_human" || exercise === "oral_recitation") {
    return (
      <div className={styles.result} data-testid="practice-requires-human">
        <p className={styles.resultTitle}>{t("learner.practice.teacherWillListen.title")}</p>
        <p className={styles.resultBody}>{t("learner.practice.teacherWillListen.body")}</p>
      </div>
    );
  }
  if (result.kind === "recorded") {
    return (
      <div className={styles.result} data-testid="practice-recorded">
        <p className={styles.resultTitle}>{t("learner.practice.recorded")}</p>
        <p className={styles.resultBody}>{t("learner.practice.recordedBody")}</p>
      </div>
    );
  }
  if (result.kind === "queued") {
    return (
      <div className={styles.result} data-testid="practice-queued">
        <p className={styles.resultTitle}>{t("state.pendingSync")}</p>
        <p className={styles.resultBody}>{t("learner.sync.notCounted")}</p>
      </div>
    );
  }
  return (
    <div className={styles.result} data-testid="practice-rejected">
      <p className={styles.resultTitle}>{t("learner.practice.notRecorded")}</p>
      <p className={styles.resultBody}>{t("learner.practice.notRecordedBody")}</p>
    </div>
  );
}

/* -------------------------------------------------------------------- rungs */

/**
 * Listen.
 *
 * With no approved recitation in the package there is nothing to play, and the
 * screen says so instead of showing a dead play button. With audio but no
 * measured timings it plays with NO highlight and explains why — an interpolated
 * highlight drifts, and a drifting highlight teaches the wrong rhythm.
 */
function ListenRung({
  audio,
  hasTimings,
  words,
  busy,
  onSubmit,
}: {
  readonly audio: AudioPayload;
  readonly hasTimings: boolean;
  readonly words: number;
  readonly busy: boolean;
  readonly onSubmit: (evidence: AttemptEvidence) => void;
}) {
  const { t } = useSurface();
  const [playedMs, setPlayedMs] = useState(0);
  const [replays, setReplays] = useState(0);
  const element = useRef<HTMLAudioElement | null>(null);

  if (audio.kind === "not_yet_recorded") {
    return (
      <div className={styles.tray} data-testid="listen-no-audio">
        <EmptyState
          variant="not-yet-recorded"
          title={t("learner.listen.noAudio.title")}
          description={t("learner.listen.noAudio.body")}
          action={
            <LinkButton href="/quran?view=read" variant="secondary">
              {t("learner.today.maintenance.action")}
            </LinkButton>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.tray}>
      {hasTimings ? null : <p className={styles.notice}>{t("learner.listen.noTimings")}</p>}
      <audio
        ref={element}
        src={audio.src}
        controls
        aria-label={t("learner.a11y.audio")}
        onTimeUpdate={(event) => setPlayedMs(event.currentTarget.currentTime * 1000)}
        onEnded={() => setReplays((n) => n + 1)}
      />
      <p className={styles.countRow}>{t("learner.listen.replays", { count: replays })}</p>
      <Button
        variant="primary"
        loading={busy}
        onClick={() =>
          onSubmit({
            exercise: "listen",
            playedMs,
            ayahDurationMs: Math.max(1, (element.current?.duration ?? 0) * 1000),
            replays,
          })
        }
      >
        {t("learner.practice.submit")}
      </Button>
      <p className={styles.quietNotice}>{t("learner.recallFirst.wordsProduced", { count: words })}</p>
    </div>
  );
}

/**
 * Recall the first words — before anything is shown.
 *
 * The page stays blank until the learner commits. That is the whole exercise: a
 * first-word recall that happens with the āyah on screen proves only that they
 * can read.
 */
function RecallFirstRung({
  expectedWordCount,
  allowsTextInput,
  committed,
  hints,
  busy,
  onCommit,
  onSubmit,
}: {
  readonly expectedWordCount: number;
  readonly allowsTextInput: boolean;
  readonly committed: boolean;
  readonly hints: number;
  readonly busy: boolean;
  readonly onCommit: () => void;
  readonly onSubmit: (evidence: AttemptEvidence) => void;
}) {
  const { t } = useSurface();
  const [typed, setTyped] = useState("");
  const committedAt = useRef<number | null>(null);

  if (!committed) {
    return (
      <div className={styles.tray}>
        <p className={styles.instruction}>{t("learner.recallFirst.prompt")}</p>
        <p className={styles.notice}>{t("learner.recallFirst.blankNotice")}</p>
        <Button
          variant="primary"
          data-testid="recall-commit"
          onClick={() => {
            committedAt.current = Date.now();
            onCommit();
          }}
        >
          {t("learner.practice.commit")}
        </Button>
      </div>
    );
  }

  const submit = (producedWordCount: number) =>
    onSubmit({
      exercise: "recall_first",
      producedWordCount,
      expectedWordCount: Math.max(1, expectedWordCount),
      revealedAfterMs: committedAt.current === null ? null : Date.now() - committedAt.current,
      hintsUsed: hints,
    });

  /* Children have no text input, by tier policy. They report what they did, and
     the server decides what that was worth — a self-report is an observation. */
  if (!allowsTextInput) {
    return (
      <div className={styles.tray}>
        <div className={styles.choices}>
          <Button variant="primary" loading={busy} onClick={() => submit(expectedWordCount)}>
            {t("learner.recallFirst.spoken")}
          </Button>
          <Button variant="secondary" loading={busy} onClick={() => submit(Math.floor(expectedWordCount / 2))}>
            {t("learner.gapFill.got")}
          </Button>
          <Button variant="quiet" loading={busy} onClick={() => submit(0)}>
            {t("learner.gapFill.missed")}
          </Button>
        </div>
      </div>
    );
  }

  const words = typed.trim() === "" ? 0 : typed.trim().split(/\s+/).length;
  return (
    <div className={styles.tray}>
      <Textarea
        value={typed}
        onChange={(event) => setTyped(event.currentTarget.value)}
        rows={3}
        lang="ar"
        dir="rtl"
        aria-label={t("learner.recallFirst.typed")}
        data-testid="recall-input"
      />
      <p className={styles.countRow}>{t("learner.recallFirst.wordsProduced", { count: words })}</p>
      <Button variant="primary" loading={busy} onClick={() => submit(words)} data-testid="recall-submit">
        {t("learner.practice.submit")}
      </Button>
    </div>
  );
}

/**
 * Rebuild — and the tray is shuffled after every single placement.
 *
 * `correct` on a placement means "this tile was the next word of the passage": a
 * comparison of positions, not a judgement. The server decides what a run of
 * those observations was worth.
 */
function RebuildRung({
  words,
  seed,
  busy,
  onSubmit,
}: {
  readonly words: readonly string[];
  readonly seed: number;
  readonly busy: boolean;
  readonly onSubmit: (evidence: AttemptEvidence) => void;
}) {
  const { t } = useSurface();
  const startedAt = useStartedAt();
  const [state, setState] = useState<RebuildState>(() => startRebuild(words.length, seed));

  const done = isComplete(state);

  return (
    <div className={styles.tray}>
      <p className={styles.instruction}>{t("learner.rebuild.line")}</p>
      <div className={styles.placedLine} data-testid="rebuild-line" lang="ar" dir="rtl">
        {state.placed.length === 0 ? (
          <span className={styles.quietNotice}>{t("learner.rebuild.empty")}</span>
        ) : (
          state.placed.map((index) => (
            <span key={index} className={styles.placedWord}>
              {words[index]}
            </span>
          ))
        )}
      </div>

      <Progress value={state.placed.length} max={Math.max(1, words.length)} label={t("learner.rebuild.placed")} />

      <p className={styles.instruction}>{t("learner.rebuild.tray")}</p>
      <div className={styles.tiles} data-testid="rebuild-tray">
        {state.tray.map((index) => (
          <Tile
            key={index}
            text={words[index] ?? ""}
            slot={index + 1}
            onSelect={() => setState((current) => place(current, index))}
            wrongMessageKey="learner.rebuild.wrongWord"
          />
        ))}
      </div>

      <Button
        variant="primary"
        disabled={!done}
        loading={busy}
        data-testid="rebuild-submit"
        onClick={() => onSubmit(rebuildEvidence(state, Date.now() - startedAt()))}
      >
        {t("learner.practice.submit")}
      </Button>
    </div>
  );
}

/**
 * Gap fill.
 *
 * The decoys come from the āyah's own words, so choosing is a real retrieval
 * rather than a guess between one plausible word and two nonsense ones. Which
 * word was chosen is compared by POSITION; no Arabic is compared or authored.
 */
function GapFillRung({
  words,
  gaps,
  busy,
  onSubmit,
}: {
  readonly words: readonly string[];
  readonly gaps: readonly number[];
  readonly busy: boolean;
  readonly onSubmit: (evidence: AttemptEvidence) => void;
}) {
  const { t } = useSurface();
  const [answers, setAnswers] = useState<ReadonlyMap<number, { correct: boolean; attempts: number }>>(new Map());

  const record = (gap: number, chosen: number) => {
    setAnswers((current) => {
      const next = new Map(current);
      const existing = next.get(gap);
      next.set(gap, { correct: chosen === gap, attempts: (existing?.attempts ?? 0) + 1 });
      return next;
    });
  };

  const answered = gaps.every((gap) => answers.has(gap));

  return (
    <div className={styles.tray}>
      <p className={styles.instruction}>{t("learner.gapFill.prompt")}</p>
      {gaps.map((gap, position) => {
        const decoys = choicesFor(words, gap);
        const answer = answers.get(gap);
        return (
          <div key={gap} className={styles.choices}>
            <p className={styles.countRow}>{t("learner.gapFill.gap", { index: position + 1 })}</p>
            <div className={styles.tiles}>
              {decoys.map((choice) => (
                <Tile
                  key={choice}
                  text={words[choice] ?? ""}
                  state={answer === undefined ? "default" : choice === gap && answer.correct ? "placed" : "default"}
                  onSelect={() => record(gap, choice)}
                />
              ))}
            </div>
          </div>
        );
      })}
      <Button
        variant="primary"
        disabled={!answered}
        loading={busy}
        data-testid="gapfill-submit"
        onClick={() =>
          onSubmit({
            exercise: "gap_fill",
            gaps: gaps.map((gap) => ({
              wordIndex: gap,
              correct: answers.get(gap)?.correct ?? false,
              attempts: answers.get(gap)?.attempts ?? 0,
            })),
          })
        }
      >
        {t("learner.practice.submit")}
      </Button>
    </div>
  );
}

/** Three word positions: the right one and two of its neighbours, in page order. */
function choicesFor(words: readonly string[], gap: number): readonly number[] {
  const pool = new Set<number>([gap]);
  for (const offset of [-2, -1, 1, 2]) {
    const candidate = gap + offset;
    if (pool.size >= 3) break;
    if (candidate >= 0 && candidate < words.length) pool.add(candidate);
  }
  return [...pool].sort((a, b) => a - b);
}

/** Hear one āyah, produce the one after it. The join is what actually breaks. */
function NextAyahCueRung({
  cueLabel,
  unitLabel,
  hints,
  busy,
  onSubmit,
}: {
  readonly cueLabel: string;
  readonly unitLabel: string;
  readonly hints: number;
  readonly busy: boolean;
  readonly onSubmit: (evidence: AttemptEvidence) => void;
}) {
  const { t } = useSurface();
  const startedAt = useStartedAt();
  const submit = (producedFirstWords: boolean) =>
    onSubmit({
      exercise: "next_ayah_cue",
      // An ASCII reference. Scripture cannot ride in on an evidence payload.
      cueAyah: unitLabel.replace(/[^A-Za-z0-9:._>-]/g, ""),
      producedFirstWords,
      latencyMs: Date.now() - startedAt(),
      hintsUsed: hints,
    });

  return (
    <div className={styles.tray}>
      <p className={styles.instruction}>{t("learner.nextAyahCue.prompt", { cue: cueLabel })}</p>
      <div className={styles.choices}>
        <Button variant="primary" loading={busy} onClick={() => submit(true)} data-testid="cue-produced">
          {t("learner.nextAyahCue.produced")}
        </Button>
        <Button variant="quiet" loading={busy} onClick={() => submit(false)}>
          {t("learner.nextAyahCue.notProduced")}
        </Button>
      </div>
    </div>
  );
}

/** Connect several āyāt from a blank page, and say honestly where it broke. */
function ConnectChainRung({
  ayahs,
  committed,
  busy,
  onCommit,
  onSubmit,
}: {
  readonly ayahs: readonly number[];
  readonly committed: boolean;
  readonly busy: boolean;
  readonly onCommit: () => void;
  readonly onSubmit: (evidence: AttemptEvidence) => void;
}) {
  const { t } = useSurface();
  if (!committed) {
    return (
      <div className={styles.tray}>
        <p className={styles.instruction}>{t("learner.connectChain.prompt", { count: ayahs.length })}</p>
        <Button variant="primary" onClick={onCommit} data-testid="chain-commit">
          {t("learner.practice.commit")}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.tray}>
      <p className={styles.instruction}>{t("learner.connectChain.prompt", { count: ayahs.length })}</p>
      <div className={styles.choices}>
        {ayahs.map((ayah, index) => (
          <Button
            key={ayah}
            variant={index === ayahs.length - 1 ? "primary" : "secondary"}
            loading={busy}
            onClick={() =>
              onSubmit({
                exercise: "connect_chain",
                ayahsRequested: ayahs.length,
                ayahsProducedInOrder: index + 1,
                breaks: index + 1 < ayahs.length ? [index + 1] : [],
              })
            }
          >
            {t("learner.connectChain.reached", { index: ayah })}
          </Button>
        ))}
        <Button
          variant="quiet"
          loading={busy}
          onClick={() =>
            onSubmit({ exercise: "connect_chain", ayahsRequested: ayahs.length, ayahsProducedInOrder: 0, breaks: [0] })
          }
        >
          {t("learner.connectChain.broke")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The ear-gate.
 *
 * Nothing here grades anything, and nothing here can. The grader answers
 * `requires_human` for this rung by construction, and the screen says "your
 * teacher will listen". Recording is consent-gated and optional: the request can
 * be sent without audio, which is a normal outcome and not a degraded one.
 */
function OralRecitationRung({
  expectedWordCount,
  busy,
  onSubmit,
}: {
  readonly expectedWordCount: number;
  readonly busy: boolean;
  readonly onSubmit: (evidence: AttemptEvidence) => void;
}) {
  const { t } = useSurface();
  const startedAt = useStartedAt();
  return (
    <div className={styles.tray}>
      <p className={styles.instruction}>{t("learner.oral.prompt")}</p>
      <p className={styles.quietNotice}>{t("learner.oral.consentNeeded")}</p>
      <Button
        variant="primary"
        loading={busy}
        data-testid="oral-send"
        onClick={() =>
          onSubmit({
            exercise: "oral_recitation",
            recordedMs: Date.now() - startedAt(),
            expectedWordCount: Math.max(1, expectedWordCount),
            // Advisory only, and never read by the grader. Absent is honest.
            advisoryMatchRate: null,
          })
        }
      >
        {t("learner.oral.send")}
      </Button>
    </div>
  );
}
