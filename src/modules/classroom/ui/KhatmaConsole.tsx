"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Field, Input, Select, Textarea } from "../../design/ui/controls";
import { Badge, EmptyState } from "../../design/ui/display";
import { useSurface } from "../../design/theme/ThemeProvider";
import { CORRECTIONS } from "../../assessment/domain/taxonomy";
import { dropKhatmaFlag, resolveKhatmaFlag } from "../actions/khatma";
import styles from "./TeacherConsole.module.css";

/**
 * The khatma console.
 *
 * Listening to a whole juzʾ is a different act from hearing five āyāt. A
 * teacher cannot stop to write, and what they notice at āyah 40 they will want
 * again next week. So a flag is a pin: a position, a category, an optional
 * note — dropped in one action and kept until someone resolves it.
 *
 * Flags are NOT verdicts. They verify nothing and change no memory state; they
 * are a teacher's own margin notes, and the unresolved ones are a promise to
 * come back.
 */
export type KhatmaFlagView = {
  readonly id: string;
  readonly learnerUserId: string;
  readonly learnerName: string;
  readonly sura: number;
  readonly ayah: number;
  readonly wordIndex: number | null;
  readonly category: string;
  readonly note: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
};

export type KhatmaConsoleProps = {
  readonly learners: readonly { readonly userId: string; readonly displayName: string }[];
  readonly flags: readonly KhatmaFlagView[];
};

export function KhatmaConsole({ learners, flags }: KhatmaConsoleProps) {
  const { t, locale } = useSurface();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [learnerUserId, setLearnerUserId] = useState(learners[0]?.userId ?? "");
  const [sura, setSura] = useState("2");
  const [ayah, setAyah] = useState("1");
  const [category, setCategory] = useState(CORRECTIONS[0]?.category ?? "hesitation");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = flags.filter((flag) => flag.resolvedAt === null);
  const closed = flags.filter((flag) => flag.resolvedAt !== null);

  const drop = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await dropKhatmaFlag({
        learnerUserId,
        position: { sura: Number(sura), ayah: Number(ayah) },
        category,
        ...(note.trim() === "" ? {} : { note: note.trim() }),
      });
      if (!result.ok) {
        setError(t("teacher.khatma.failed"));
        return;
      }
      setNote("");
      router.refresh();
    });
  };

  const resolve = (flagId: string): void => {
    startTransition(async () => {
      await resolveKhatmaFlag({ flagId });
      router.refresh();
    });
  };

  const describe = (flag: KhatmaFlagView): string =>
    flag.wordIndex === null
      ? t("teacher.khatma.position", { sura: flag.sura, ayah: flag.ayah })
      : t("teacher.khatma.positionWord", {
          sura: flag.sura,
          ayah: flag.ayah,
          word: flag.wordIndex,
        });

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{t("teacher.khatma.open")}</h2>
        <p className={styles.sectionNote}>{t("teacher.khatma.acrossSessions")}</p>

        {open.length === 0 ? (
          <EmptyState description={t("teacher.khatma.noOpenFlags")} />
        ) : (
          <ul className={styles.checklist}>
            {open.map((flag) => (
              <li key={flag.id} className={styles.checkRow}>
                <Badge tone="caution" dot>
                  {t(`correction.${camel(flag.category)}`)}
                </Badge>
                <span className={styles.checkLabel}>
                  {flag.learnerName} · {describe(flag)}
                  {flag.note === null ? "" : ` · ${flag.note}`}
                </span>
                <Button size="sm" variant="secondary" loading={pending} onClick={() => resolve(flag.id)}>
                  {t("teacher.khatma.resolve")}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {closed.length === 0 ? null : (
          <>
            <h3 className={styles.sectionTitle}>{t("teacher.khatma.resolved")}</h3>
            <ul className={styles.checklist}>
              {closed.map((flag) => (
                <li key={flag.id} className={styles.checkRow} data-state="done">
                  <Badge tone="neutral" dot>
                    {t(`correction.${camel(flag.category)}`)}
                  </Badge>
                  <span className={styles.checkLabel}>
                    {flag.learnerName} · {describe(flag)} ·{" "}
                    {t("teacher.khatma.resolvedAt", {
                      date: new Date(flag.resolvedAt ?? "").toLocaleDateString(locale),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{t("teacher.khatma.flagHere")}</h2>
        <div className={styles.stack}>
          <Field label={t("teacher.khatma.chooseStudent")}>
            <Select value={learnerUserId} onChange={(event) => setLearnerUserId(event.target.value)}>
              {learners.map((learner) => (
                <option key={learner.userId} value={learner.userId}>
                  {learner.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <div className={styles.rowActions}>
            <Field label={t("teacher.verify.wentToSura")}>
              <Input inputMode="numeric" value={sura} onChange={(event) => setSura(event.target.value)} />
            </Field>
            <Field label={t("teacher.verify.wentToAyah")}>
              <Input inputMode="numeric" value={ayah} onChange={(event) => setAyah(event.target.value)} />
            </Field>
          </div>
          <div className={styles.rowActions}>
            {CORRECTIONS.map((correction) => (
              <Chip
                key={correction.category}
                selected={category === correction.category}
                onClick={() => setCategory(correction.category)}
              >
                {t(correction.labelKey)}
              </Chip>
            ))}
          </div>
          <Field label={t("teacher.khatma.note")}>
            <Textarea rows={2} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          {error === null ? null : (
            <p role="alert" className={styles.meta}>
              {error}
            </p>
          )}
          <Button variant="primary" loading={pending} disabled={learnerUserId === ""} onClick={drop}>
            {t("teacher.khatma.flagHere")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function camel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
