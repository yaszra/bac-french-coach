"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, Chip, Field, Input, Textarea } from "../../design/ui/controls";
import { Badge, EmptyState } from "../../design/ui/display";
import { MushafPage, PageFrame, type MushafLine, type MushafWord } from "../../design/ui/mushaf";
import { useSurface } from "../../design/theme/ThemeProvider";
import { CORRECTIONS, type CorrectionCategory, type CorrectionMark } from "../domain/taxonomy";
import { recordVerdict } from "../actions/record-verdict";
import styles from "./VerificationConsole.module.css";

/**
 * Approve-and-next: the console a teacher works in while a learner recites.
 *
 * The shape of it comes from what actually happens in a ḥalaqah. A teacher
 * listens with the page in front of them; when something slips they need one
 * tap, at the right word, without breaking the learner's rhythm; and at the
 * end they need one action that records the verdict and brings the next person
 * up. Everything else on this screen is subordinate to that.
 *
 * Three rules the code holds to:
 *
 *  · A correction marks a POSITION — sūrah, āyah, word index — and never text.
 *    The word a teacher taps is identified by where it is, and its Arabic is
 *    read from the content package for display only. Nothing typed here, and
 *    nothing submitted from here, contains a character of scripture.
 *
 *  · A wrong join records where the learner WENT. That is the one correction
 *    that needs a second position, and it is the most valuable thing a teacher
 *    can capture: a mutashābih confusion, observed rather than guessed.
 *
 *  · A verdict is a person's word, recorded once. The screen says so, and the
 *    server enforces it. There is no edit button, because an edit would erase
 *    what a teacher actually said.
 */
export type VerificationView = {
  readonly requestId: string;
  readonly learnerUserId: string;
  readonly learnerName: string;
  /** The unit ids this verdict decides. References, computed by the server. */
  readonly unitIds: readonly string[];
  readonly scopeLabel: string;
  /** The muṣḥaf page, already resolved from the content package. */
  readonly lines: readonly MushafLine[];
  readonly page: number | null;
  /** The sūrah the page words belong to, for addressing a correction. */
  readonly sura: number;
  /** Where "record and next" goes, or null when this is the last one. */
  readonly nextHref: string | null;
  readonly remaining: number;
};

type Verdict = "passed" | "needs_work" | "not_attempted";

type MarkedPosition = { readonly ayah: number; readonly index: number };

const MEMORY = CORRECTIONS.filter((c) => c.family === "memory");
const ARTICULATION = CORRECTIONS.filter((c) => c.family === "articulation");

export function VerificationConsole({ view }: { readonly view: VerificationView }) {
  const { t } = useSurface();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [position, setPosition] = useState<MarkedPosition | null>(null);
  const [marks, setMarks] = useState<readonly CorrectionMark[]>([]);
  const [wentToSura, setWentToSura] = useState("");
  const [wentToAyah, setWentToAyah] = useState("");
  const [note, setNote] = useState("");
  const [verdict, setVerdict] = useState<Verdict>("passed");
  const [error, setError] = useState<string | null>(null);

  /* The tapped word is shown with a live underline so the teacher can see
     where the next tap will land. It is the page's one moving mark. */
  const lines = useMemo<readonly MushafLine[]>(
    () =>
      view.lines.map((line) => ({
        ...line,
        words: line.words.map((word) =>
          position !== null && word.ayah === position.ayah && word.index === position.index
            ? { ...word, state: "active" as const }
            : word,
        ),
      })),
    [view.lines, position],
  );

  const addMark = (category: CorrectionCategory): void => {
    if (position === null) {
      setError(t("teacher.verify.chooseWordFirst"));
      return;
    }
    setError(null);
    const wentTo =
      category === "wrong_join" && wentToSura !== "" && wentToAyah !== ""
        ? { sura: Number(wentToSura), ayah: Number(wentToAyah) }
        : undefined;

    setMarks((current) => [
      ...current,
      {
        category,
        sura: view.sura,
        ayah: position.ayah,
        wordIndex: position.index,
        ...(wentTo === undefined ? {} : { wentTo }),
      },
    ]);
  };

  const removeMark = (at: number): void => {
    setMarks((current) => current.filter((_, index) => index !== at));
  };

  const submit = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await recordVerdict({
        verificationRequestId: view.requestId,
        learnerUserId: view.learnerUserId,
        verdict,
        unitIds: [...view.unitIds],
        // Positions and categories only. No text of any kind travels here.
        corrections: marks.map((mark) => ({
          category: mark.category,
          sura: mark.sura,
          ayah: mark.ayah,
          ...(mark.wordIndex === undefined ? {} : { wordIndex: mark.wordIndex }),
          ...(mark.wentTo === undefined ? {} : { wentTo: mark.wentTo }),
        })),
        ...(note.trim() === "" ? {} : { note: note.trim() }),
      });

      if (!result.ok) {
        setError(
          t(
            result.error === "already_decided"
              ? "teacher.verify.alreadyDecided"
              : result.error === "not_allowed"
                ? "teacher.verify.notAllowed"
                : "teacher.verify.failed",
          ),
        );
        return;
      }
      router.push(view.nextHref ?? "/teacher/verify");
      router.refresh();
    });
  };

  const onWordSelect = (word: MushafWord): void => {
    setPosition({ ayah: word.ayah, index: word.index });
    setError(null);
  };

  return (
    <div className={styles.layout}>
      <div className={styles.pane}>
        <div className={styles.header}>
          <h1 className={styles.who}>{t("teacher.verify.listening", { name: view.learnerName })}</h1>
          <p className={styles.scope}>{view.scopeLabel}</p>
        </div>
        {view.lines.length === 0 ? (
          <EmptyState variant="not-yet-recorded" description={t("teacher.verify.pageMissing")} />
        ) : (
          <PageFrame page={view.page ?? 0}>
            <MushafPage lines={lines} onWordSelect={onWordSelect} />
          </PageFrame>
        )}
      </div>

      <div className={styles.tray}>
        <div>
          <h2 className={styles.trayTitle}>{t("teacher.verify.markHeading")}</h2>
          <p className={styles.help}>{t("teacher.verify.markHelp")}</p>
        </div>

        <p className={position === null ? `${styles.position} ${styles.positionEmpty}` : styles.position}>
          {position === null
            ? t("teacher.verify.noWordSelected")
            : t("teacher.verify.selectedWord", {
                sura: view.sura,
                ayah: position.ayah,
                word: position.index,
              })}
        </p>

        <div>
          <p className={styles.familyLabel}>{t("teacher.verify.familyMemory")}</p>
          <div className={styles.chips}>
            {MEMORY.map((correction) => (
              <Chip
                key={correction.category}
                tone="caution"
                onClick={() => addMark(correction.category)}
              >
                {t(correction.labelKey)}
              </Chip>
            ))}
          </div>

          <p className={styles.familyLabel}>{t("teacher.verify.familyArticulation")}</p>
          <div className={styles.chips}>
            {ARTICULATION.map((correction) => (
              <Chip
                key={correction.category}
                tone="accent"
                onClick={() => addMark(correction.category)}
              >
                {t(correction.labelKey)}
              </Chip>
            ))}
          </div>
        </div>

        {/* A wrong join is the one correction that needs a SECOND position:
            not only where they lost the thread but where they went instead.
            That pair is a mutashābih confusion, observed rather than guessed,
            and it is the most valuable thing a teacher can record here. */}
        <div>
          <p className={styles.familyLabel}>{t("teacher.verify.wentTo")}</p>
          <p className={styles.help}>{t("teacher.verify.wentToHelp")}</p>
          <div className={styles.wentTo}>
            <Field
              label={t("teacher.verify.wentToSura")}
              hideLabel={false}
              className={styles.wentToField}
            >
              <Input
                inputMode="numeric"
                value={wentToSura}
                onChange={(event) => setWentToSura(event.target.value)}
              />
            </Field>
            <Field label={t("teacher.verify.wentToAyah")} className={styles.wentToField}>
              <Input
                inputMode="numeric"
                value={wentToAyah}
                onChange={(event) => setWentToAyah(event.target.value)}
              />
            </Field>
          </div>
        </div>

        <div>
          <p className={styles.familyLabel}>{t("teacher.verify.marks")}</p>
          {marks.length === 0 ? (
            <p className={styles.help}>{t("teacher.verify.noMarks")}</p>
          ) : (
            <ul className={styles.marks}>
              {marks.map((mark, index) => (
                <li key={`${mark.category}-${mark.ayah}-${mark.wordIndex}-${index}`} className={styles.mark}>
                  <span className={styles.markText}>
                    {t(`correction.${categoryKey(mark.category)}`)}{" "}
                    <span className={styles.markWhere}>
                      {t("teacher.verify.selectedWord", {
                        sura: mark.sura,
                        ayah: mark.ayah,
                        word: mark.wordIndex ?? 0,
                      })}
                    </span>
                  </span>
                  <Button variant="quiet" size="sm" onClick={() => removeMark(index)}>
                    {t("teacher.verify.removeMark")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className={styles.familyLabel}>{t("teacher.verify.verdictHeading")}</p>
          <div className={styles.verdictRow}>
            <Chip selected={verdict === "passed"} onClick={() => setVerdict("passed")}>
              {t("teacher.verify.passed")}
            </Chip>
            <Chip selected={verdict === "needs_work"} onClick={() => setVerdict("needs_work")}>
              {t("teacher.verify.needsWork")}
            </Chip>
            <Chip selected={verdict === "not_attempted"} onClick={() => setVerdict("not_attempted")}>
              {t("teacher.verify.notAttempted")}
            </Chip>
          </div>
        </div>

        <div className={styles.once}>
          <p className={styles.onceTitle}>{t("teacher.verify.onceOnly")}</p>
          <p className={styles.onceBody}>{t("teacher.verify.onceOnlyBody")}</p>
        </div>

        {error === null ? null : (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button variant="primary" loading={pending} onClick={submit} data-testid="record-verdict">
            {view.nextHref === null ? t("teacher.verify.submitOnly") : t("teacher.verify.submit")}
          </Button>
          <Badge tone="neutral">{t("teacher.verify.queue", { count: view.remaining })}</Badge>
        </div>

        {/* The note is last on purpose. It is a teacher's aside to themselves,
            not part of the verdict, and it must never sit between them and the
            action that records what they just heard. */}
        <Field label={t("teacher.verify.note")}>
          <Textarea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

/** The taxonomy's label keys are camelCase; its categories are snake_case. */
function categoryKey(category: CorrectionCategory): string {
  return category.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
