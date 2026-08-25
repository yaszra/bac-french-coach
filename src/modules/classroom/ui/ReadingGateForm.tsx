"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "../../design/ui/controls";
import { Badge } from "../../design/ui/display";
import { useSurface } from "../../design/theme/ThemeProvider";
import { recordReadingGate } from "../../assessment/actions/record-reading-gate";
import { READING_EVIDENCE_KIND } from "../schemas/reading-gate";
import styles from "./TeacherConsole.module.css";

/**
 * The in-person Qāʿidah rung.
 *
 * The evidence kind is not a checkbox a teacher could forget: it is stamped on
 * every submission from this form and nowhere else. That is what lets a report
 * say "heard in person" and mean it, and what stops an app exercise ever being
 * shown as if a teacher had sat and listened.
 */
export function ReadingGateForm({
  learners,
  lessons,
}: {
  readonly learners: readonly { readonly userId: string; readonly displayName: string }[];
  readonly lessons: readonly string[];
}) {
  const { t } = useSurface();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [learnerUserId, setLearnerUserId] = useState(learners[0]?.userId ?? "");
  const [lessonId, setLessonId] = useState(lessons[0] ?? "");
  const [message, setMessage] = useState<string | null>(null);

  const confirm = (): void => {
    startTransition(async () => {
      const result = await recordReadingGate({
        learnerUserId,
        lessonId,
        evidenceKind: READING_EVIDENCE_KIND,
      });
      setMessage(t(result.ok ? "teacher.readingGate.recorded" : "teacher.readingGate.failed"));
      if (result.ok) router.refresh();
    });
  };

  return (
    <section className={styles.card}>
      <h2 className={styles.sectionTitle}>{t("teacher.readingGate.heading")}</h2>
      <p className={styles.sectionNote}>{t("teacher.readingGate.lede")}</p>
      <div className={styles.stack}>
        <Field label={t("teacher.readingGate.student")}>
          <Select value={learnerUserId} onChange={(event) => setLearnerUserId(event.target.value)}>
            {learners.map((learner) => (
              <option key={learner.userId} value={learner.userId}>
                {learner.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("teacher.readingGate.lesson")}>
          {lessons.length > 0 ? (
            <Select value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
              {lessons.map((lesson) => (
                <option key={lesson} value={lesson}>
                  {lesson}
                </option>
              ))}
            </Select>
          ) : (
            <Input value={lessonId} onChange={(event) => setLessonId(event.target.value)} />
          )}
        </Field>
        <Badge tone="accent" dot>
          {t("teacher.readingGate.evidenceKind")}
        </Badge>
        {message === null ? null : (
          <p className={styles.meta} role="status">
            {message}
          </p>
        )}
        <Button
          variant="primary"
          loading={pending}
          disabled={learnerUserId === "" || lessonId === ""}
          onClick={confirm}
        >
          {t("teacher.readingGate.confirm")}
        </Button>
      </div>
    </section>
  );
}
