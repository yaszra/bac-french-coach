"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Field, Input, Select, Switch } from "../../design/ui/controls";
import { EmptyState } from "../../design/ui/display";
import { useSurface } from "../../design/theme/ThemeProvider";
import {
  DEFAULT_LOCKED_SETTINGS,
  WIZARD_STEPS,
  checkScope,
  emptyDraft,
  reviewLines,
  stepComplete,
  unitsIn,
  type AssignmentTrack,
  type ScopeItem,
  type WizardDraft,
  type WizardStep,
} from "../domain/assignment-scope";
import { createAssignment } from "../actions/create-assignment";
import styles from "./TeacherConsole.module.css";
import wizard from "./AssignWizard.module.css";

/**
 * Who → What → How → Review.
 *
 * The wizard holds a draft and nothing else; every question about that draft —
 * is this step finished, is this range legal, what will each learner actually
 * receive — is answered by the pure domain. This component decides layout and
 * nothing about meaning, which is why the review step can be trusted: it is
 * rendering `reviewLines(draft)`, the same data the server will write down.
 *
 * "What" carries references only. There is no free-text field anywhere in this
 * step, so there is no way for scripture to enter an assignment by accident.
 */
export type AssignWizardProps = {
  readonly classroomId: string;
  readonly learners: readonly { readonly userId: string; readonly displayName: string }[];
  readonly reciters: readonly string[];
  readonly exercises: readonly string[];
};

const TRACK_KEY: Readonly<Record<AssignmentTrack, string>> = {
  hifz: "teacher.assign.trackHifz",
  reading: "teacher.assign.trackReading",
  review: "teacher.assign.trackReview",
};

export function AssignWizard({ classroomId, learners, reciters, exercises }: AssignWizardProps) {
  const { t, locale } = useSurface();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<WizardStep>("who");
  const [draft, setDraft] = useState<WizardDraft>(emptyDraft());
  const [error, setError] = useState<string | null>(null);

  const [sura, setSura] = useState("78");
  const [ayahFrom, setAyahFrom] = useState("1");
  const [ayahTo, setAyahTo] = useState("5");

  const stepIndex = WIZARD_STEPS.indexOf(step);
  const check = useMemo(
    () => checkScope(draft.scope, draft.learnerUserIds),
    [draft.scope, draft.learnerUserIds],
  );
  const lines = useMemo(() => reviewLines(draft), [draft]);
  const nameOf = useMemo(
    () => new Map(learners.map((learner) => [learner.userId, learner.displayName])),
    [learners],
  );

  const toggleLearner = (userId: string): void => {
    setDraft((current) => ({
      ...current,
      learnerUserIds: current.learnerUserIds.includes(userId)
        ? current.learnerUserIds.filter((id) => id !== userId)
        : [...current.learnerUserIds, userId],
    }));
  };

  const addRange = (): void => {
    const item: ScopeItem = {
      kind: "ayah_range",
      sura: Number(sura),
      ayahFrom: Number(ayahFrom),
      ayahTo: Number(ayahTo),
    };
    // Refuse it here rather than letting the review step describe nonsense.
    if (!checkScope([item], ["x"]).ok) {
      setError(t("teacher.assign.problem.range_out_of_bounds"));
      return;
    }
    setError(null);
    setDraft((current) => ({ ...current, scope: [...current.scope, item] }));
  };

  const removeScope = (at: number): void => {
    setDraft((current) => ({ ...current, scope: current.scope.filter((_, index) => index !== at) }));
  };

  const create = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await createAssignment({
        classroomId,
        learnerUserIds: [...draft.learnerUserIds],
        track: draft.track,
        scope: [...draft.scope],
        settings: { ...draft.settings, exercises: [...draft.settings.exercises] },
        dueAt: draft.dueAt,
      });
      if (!result.ok) {
        setError(t("teacher.assign.failed"));
        return;
      }
      router.push("/teacher/today");
      router.refresh();
    });
  };

  const canAdvance = stepComplete(draft, step);

  return (
    <div className={wizard.root}>
      <ol className={wizard.steps}>
        {WIZARD_STEPS.map((id, index) => (
          <li key={id} className={wizard.step} data-state={index === stepIndex ? "current" : index < stepIndex ? "done" : "later"}>
            <span className={wizard.stepIndex}>{index + 1}</span>
            <span>{t(`teacher.assign.${id}`)}</span>
          </li>
        ))}
      </ol>

      <div className={styles.card}>
        {step === "who" ? (
          <>
            <h2 className={styles.sectionTitle}>{t("teacher.assign.whoHeading")}</h2>
            {learners.length === 0 ? (
              <EmptyState description={t("teacher.assign.whoEmpty")} />
            ) : (
              <>
                <div className={styles.rowActions}>
                  {learners.map((learner) => (
                    <Chip
                      key={learner.userId}
                      selected={draft.learnerUserIds.includes(learner.userId)}
                      onClick={() => toggleLearner(learner.userId)}
                    >
                      {learner.displayName}
                    </Chip>
                  ))}
                </div>
                <p className={styles.meta}>
                  {t("teacher.assign.chosen", {
                    count: draft.learnerUserIds.length,
                    total: learners.length,
                  })}
                </p>
              </>
            )}
          </>
        ) : null}

        {step === "what" ? (
          <>
            <h2 className={styles.sectionTitle}>{t("teacher.assign.whatHeading")}</h2>
            <p className={styles.sectionNote}>{t("teacher.assign.whatHelp")}</p>

            <div className={wizard.fields}>
              <Field label={t("teacher.assign.track")}>
                <Select
                  value={draft.track}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      track: event.target.value as AssignmentTrack,
                    }))
                  }
                >
                  {(Object.keys(TRACK_KEY) as AssignmentTrack[]).map((track) => (
                    <option key={track} value={track}>
                      {t(TRACK_KEY[track])}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("teacher.assign.sura")}>
                <Input inputMode="numeric" value={sura} onChange={(e) => setSura(e.target.value)} />
              </Field>
              <Field label={t("teacher.assign.ayahFrom")}>
                <Input inputMode="numeric" value={ayahFrom} onChange={(e) => setAyahFrom(e.target.value)} />
              </Field>
              <Field label={t("teacher.assign.ayahTo")}>
                <Input inputMode="numeric" value={ayahTo} onChange={(e) => setAyahTo(e.target.value)} />
              </Field>
              <Button variant="secondary" onClick={addRange}>
                {t("teacher.assign.addRange")}
              </Button>
            </div>

            {draft.scope.length === 0 ? (
              <p className={styles.meta}>{t("teacher.assign.scopeEmpty")}</p>
            ) : (
              <ul className={wizard.scopeList}>
                {draft.scope.map((item, index) => (
                  <li key={`${item.kind}-${index}`} className={wizard.scopeRow}>
                    <span>
                      {item.kind === "ayah_range"
                        ? t("teacher.verify.scope", {
                            sura: item.sura,
                            from: item.ayahFrom,
                            to: item.ayahTo,
                          })
                        : item.kind === "pages"
                          ? t("teacher.verify.page", { page: item.pageFrom })
                          : item.lessonId}
                    </span>
                    <span className={styles.meta}>{t("teacher.assign.units", { count: unitsIn(item) })}</span>
                    <Button variant="quiet" size="sm" onClick={() => removeScope(index)}>
                      {t("teacher.assign.remove")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {step === "how" ? (
          <>
            <h2 className={styles.sectionTitle}>{t("teacher.assign.howHeading")}</h2>
            <p className={styles.sectionNote}>{t("teacher.assign.howHelp")}</p>
            <div className={wizard.fields}>
              <Field label={t("teacher.assign.reciter")}>
                <Select
                  value={draft.settings.reciterId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      settings: { ...current.settings, reciterId: event.target.value },
                    }))
                  }
                >
                  {reciters.map((reciter) => (
                    <option key={reciter} value={reciter}>
                      {reciter}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("teacher.assign.repetitions")}>
                <Input
                  inputMode="numeric"
                  value={String(draft.settings.repetitions)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        repetitions: Math.max(1, Number(event.target.value) || 1),
                      },
                    }))
                  }
                />
              </Field>
              <Field label={t("teacher.assign.scaffold")}>
                <Select
                  value={draft.settings.scaffold}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        scaffold: event.target.value as "full" | "fading" | "none",
                      },
                    }))
                  }
                >
                  <option value="full">{t("teacher.assign.scaffoldFull")}</option>
                  <option value="fading">{t("teacher.assign.scaffoldFading")}</option>
                  <option value="none">{t("teacher.assign.scaffoldNone")}</option>
                </Select>
              </Field>
            </div>

            <div className={styles.rowActions}>
              {exercises.map((exercise) => (
                <Chip
                  key={exercise}
                  selected={draft.settings.exercises.includes(exercise)}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        exercises: current.settings.exercises.includes(exercise)
                          ? current.settings.exercises.filter((id) => id !== exercise)
                          : [...current.settings.exercises, exercise],
                      },
                    }))
                  }
                >
                  {exercise}
                </Chip>
              ))}
            </div>

            <div className={wizard.switchRow}>
              <Switch
                label={t("teacher.assign.requiresVerification")}
                checked={draft.settings.requiresVerification}
                onCheckedChange={(next) =>
                  setDraft((current) => ({
                    ...current,
                    settings: { ...current.settings, requiresVerification: next },
                  }))
                }
              />
            </div>
          </>
        ) : null}

        {step === "review" ? (
          <>
            <h2 className={styles.sectionTitle}>{t("teacher.assign.reviewHeading")}</h2>
            <ul className={wizard.scopeList}>
              {lines.map((line) => (
                <li key={line.learnerUserId} className={wizard.reviewRow}>
                  {t("teacher.assign.reviewLine", {
                    name: nameOf.get(line.learnerUserId) ?? line.learnerUserId,
                    units: line.units,
                    exercises: line.exercises.join(", "),
                  })}
                  {" — "}
                  {line.requiresVerification
                    ? t("teacher.assign.reviewEar")
                    : t("teacher.assign.reviewNoEar")}
                  {", "}
                  {line.dueAt === null
                    ? t("teacher.assign.reviewNoDue")
                    : t("teacher.assign.reviewDue", {
                        date: line.dueAt.toLocaleDateString(locale),
                      })}
                </li>
              ))}
            </ul>
            {check.ok ? null : (
              <ul className={wizard.problems}>
                {check.problems.map((problem) => (
                  <li key={problem}>{t(`teacher.assign.problem.${problem}`)}</li>
                ))}
              </ul>
            )}
          </>
        ) : null}

        {error === null ? null : (
          <p className={wizard.error} role="alert">
            {error}
          </p>
        )}

        <div className={wizard.actions}>
          <p className={styles.meta}>{t("teacher.assign.step", { index: stepIndex + 1 })}</p>
          <div className={styles.rowActions}>
            {stepIndex > 0 ? (
              <Button
                variant="secondary"
                onClick={() => setStep(WIZARD_STEPS[stepIndex - 1] ?? "who")}
              >
                {t("teacher.assign.back")}
              </Button>
            ) : null}
            {step === "review" ? (
              <Button variant="primary" loading={pending} disabled={!check.ok} onClick={create}>
                {t("teacher.assign.create")}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={!canAdvance}
                onClick={() => setStep(WIZARD_STEPS[stepIndex + 1] ?? "review")}
              >
                {t("teacher.assign.next")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_LOCKED_SETTINGS };
