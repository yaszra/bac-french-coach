"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useSurface } from "@/modules/design/theme/ThemeProvider";
import { policyFor } from "@/modules/design/theme/tier";
import { Button, LinkButton } from "@/modules/design/ui/controls";
import { Badge, EmptyState, Progress } from "@/modules/design/ui/display";

import { submitActivity, type SubmitActivityResult } from "../actions/submit-activity";
import { conceptLabel } from "./concept-label";
import { ConceptStage } from "./ConceptStage";
import { Narration, type NarrationSegmentView } from "./Narration";
import { TalqinPlayer, type TalqinView } from "./TalqinPlayer";
import type { ActivityPayload } from "./session-plan";
import styles from "./reading.module.css";

export interface LessonRunnerProps {
  readonly learnerUserId: string;
  readonly items: readonly ActivityPayload[];
  readonly talqin: Readonly<Record<string, TalqinView>>;
  readonly narration: readonly NarrationSegmentView[];
  /** Where "finish" goes. Always a real destination, never a dead end. */
  readonly doneHref: string;
  readonly hasTeacher: boolean;
}

type Answer =
  | { readonly state: "idle" }
  | { readonly state: "sending" }
  | { readonly state: "answered"; readonly result: SubmitActivityResult; readonly choiceId: string | null };

/**
 * One sitting, one item at a time.
 *
 * **This component reports what happened and never what it was worth.** It knows which
 * choice was touched and how long it took; it does not know the answer, because the
 * server never sent one. Every path ends in `submitActivity`, and the server rebuilds
 * the activity from its id to check it.
 *
 * There are no hearts, no timer and no streak. A wrong answer produces a correction —
 * a message key naming what to notice — and the item stays open so it can be looked at
 * again. Nothing is deducted, because there is nothing to deduct from.
 */
export function LessonRunner(props: LessonRunnerProps) {
  const { t, tier } = useSurface();
  const router = useRouter();
  const policy = policyFor(tier);

  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer>({ state: "idle" });

  // The clock is started in an effect, never during render: a render is not an event
  // and may happen more than once, and a start time captured there would drift.
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const item = props.items[index];

  /** Moving on is one act: a new item, and a cleared answer for it. */
  const advance = useCallback(() => {
    startedAt.current = Date.now();
    setAnswer({ state: "idle" });
    setIndex((current) => current + 1);
  }, []);

  const send = useCallback(
    async (submission: Record<string, unknown>) => {
      setAnswer({ state: "sending" });
      const result = await submitActivity({
        learnerUserId: props.learnerUserId,
        submission: {
          ...submission,
          elapsedMs: Math.max(0, Date.now() - (startedAt.current ?? Date.now())),
        },
        idempotencyKey: `${String(submission.activityId)}:${String(submission.choiceId ?? submission.verdict ?? "")}`,
      });
      setAnswer({
        state: "answered",
        result,
        choiceId: typeof submission.choiceId === "string" ? submission.choiceId : null,
      });
      if (result.ok) router.refresh();
    },
    [props.learnerUserId, router],
  );

  if (props.items.length === 0 || item === undefined) {
    return (
      <EmptyState
        variant="not-yet-recorded"
        title={t("reading.practice.empty.title")}
        description={t("reading.practice.empty.body")}
        action={
          <LinkButton href={props.doneHref} variant="secondary">
            {t("reading.practice.finish")}
          </LinkButton>
        }
        data-testid="reading-runner-empty"
      />
    );
  }

  const last = index >= props.items.length - 1;
  const recorded = answer.state === "answered" && answer.result.ok;
  const talqin = props.talqin[item.conceptId];

  return (
    <div className={styles.runner} data-testid="reading-runner">
      <div className={styles.row}>
        <span data-testid="reading-step">
          {t("reading.practice.step", { index: index + 1, total: props.items.length })}
        </span>
        <Badge tone="neutral">{t(`reading.lesson.reason.${reasonName(item.reasonKey)}`)}</Badge>
      </div>
      <Progress
        value={index + (recorded ? 1 : 0)}
        max={props.items.length}
        label={t("reading.practice.heading")}
      />

      {item.phase === "intro" ? (
        <>
          <ConceptStage conceptId={item.conceptId} t={t} />
          <Narration segments={props.narration} />
          {talqin === undefined ? null : <TalqinPlayer talqin={talqin} />}
        </>
      ) : null}

      <div className={styles.prompt}>
        <p className={styles.promptLabel}>
          {t(item.kind === "recognition" ? "reading.practice.recognitionPrompt" : "reading.practice.productionPrompt")}
        </p>
        <span className={styles.glyphLarge} lang="ar" dir="rtl" data-testid="reading-prompt-glyph">
          {item.promptCodepoints.join("")}
        </span>
        <span className={styles.srOnly}>{t("reading.a11y.letterGlyph", { label: conceptLabel(t, item.conceptId) })}</span>
      </div>

      {item.kind === "recognition" ? (
        <div className={styles.choices} role="group" aria-label={t("reading.a11y.choiceGroup")}>
          {item.choices.map((choice) => (
            <Button
              key={choice.choiceId}
              variant={
                answer.state === "answered" && answer.choiceId === choice.choiceId ? "primary" : "secondary"
              }
              size={tier === "kids" ? "lg" : "md"}
              fullWidth
              loading={answer.state === "sending"}
              data-testid="reading-choice"
              data-concept={choice.conceptId}
              onClick={() =>
                void send({
                  kind: "recognition",
                  activityId: item.activityId,
                  choiceId: choice.choiceId,
                })
              }
            >
              {conceptLabel(t, choice.conceptId)}
            </Button>
          ))}
        </div>
      ) : (
        <ProductionRung
          activityId={item.activityId}
          busy={answer.state === "sending"}
          hasTeacher={props.hasTeacher}
          onSubmit={(verdict) => void send({ kind: "production", activityId: item.activityId, verdict })}
        />
      )}

      {answer.state === "answered" ? <Outcome result={answer.result} /> : null}

      <div className={styles.actions}>
        {recorded ? (
          last ? (
            <LinkButton href={props.doneHref} variant="primary" data-testid="reading-finish">
              {t("reading.practice.finish")}
            </LinkButton>
          ) : (
            <Button variant="primary" data-testid="reading-next" onClick={advance}>
              {t("reading.practice.next")}
            </Button>
          )
        ) : null}
        {policy.showsScores ? null : <span className={styles.quiet}>{t("reading.practice.noPenalties")}</span>}
      </div>
    </div>
  );
}

/** Whatever the server said, said back plainly — including "nothing was recorded". */
function Outcome({ result }: { readonly result: SubmitActivityResult }) {
  const { t } = useSurface();

  if (!result.ok) {
    return (
      <p className={styles.correction} data-testid="reading-outcome-error">
        {t("reading.practice.offline")}
      </p>
    );
  }

  if (result.outcome === "not_recorded") {
    return (
      <p className={styles.correction} data-testid="reading-outcome-not-recorded">
        {t("reading.practice.notRecorded")}
      </p>
    );
  }

  if (result.correct) {
    return (
      <div className={styles.affirm} data-testid="reading-outcome-correct">
        <strong>{t("reading.practice.right")}</strong>
        <span>{t("reading.practice.recorded")}</span>
        {result.countsTowardMastery ? null : (
          <span>{t("reading.ladder.verification.self_confirmed")}</span>
        )}
      </div>
    );
  }

  return (
    <div className={styles.correction} data-testid="reading-outcome-correction">
      <strong>{t("reading.correction.heading")}</strong>
      <span>{result.correction === null ? t("reading.correction.look_again") : t(result.correction.messageKey)}</span>
      <span>{t("reading.practice.notThisOne")}</span>
    </div>
  );
}

/**
 * Reading aloud.
 *
 * A learner may say what they think of their own reading, and that is recorded as
 * exactly that — their own word. The note beside it never dresses it up as a teacher's
 * verdict, and where a teacher exists it says plainly who closes the rung.
 */
function ProductionRung({
  activityId,
  busy,
  hasTeacher,
  onSubmit,
}: {
  readonly activityId: string;
  readonly busy: boolean;
  readonly hasTeacher: boolean;
  readonly onSubmit: (verdict: "clear" | "needs_work" | "not_observed") => void;
}) {
  const { t } = useSurface();

  return (
    <div className={styles.panel} data-testid="reading-production" data-activity={activityId}>
      <p className={styles.note}>{t(hasTeacher ? "reading.practice.teacherNote" : "reading.practice.selfConfirmNote")}</p>
      <div className={styles.actions}>
        <Button variant="primary" loading={busy} onClick={() => onSubmit("clear")} data-testid="reading-said-it">
          {t("reading.practice.saidItClearly")}
        </Button>
        <Button variant="secondary" loading={busy} onClick={() => onSubmit("needs_work")}>
          {t("reading.practice.needsMoreWork")}
        </Button>
        <Button variant="quiet" loading={busy} onClick={() => onSubmit("not_observed")}>
          {t("reading.practice.notObserved")}
        </Button>
      </div>
    </div>
  );
}

/** `reading.lesson.reason.due_for_review` → `due_for_review`. */
function reasonName(reasonKey: string): string {
  return reasonKey.split(".").slice(-1)[0] ?? "new_concept";
}
