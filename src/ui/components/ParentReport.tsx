/**
 * The parent report.
 *
 * Translates evidence into guidance a parent can act on without becoming a
 * data analyst. There is no unexplained percentage anywhere on this screen
 * — every claim names its source, and a quiet day is shown as a quiet day
 * rather than as a zero.
 */
import { useLocale } from "../i18n/context.js";

export interface HomeTask {
  id: string;
  description: string;
  assignedByName: string;
  checkedByName?: string;
  checkedOn?: string;
  done: boolean;
}

export interface ParentReportProps {
  childName: string;
  /** Plain-language sentences produced from evidence, not from a score. */
  weekSummary: readonly string[];
  /** Days with no recorded practice, named rather than implied by a gap. */
  quietDays: readonly string[];
  teacherRequest?: { text: string; teacherName: string; date: string };
  homeTasks: readonly HomeTask[];
  lastVerification?: { date: string; decision: string };
}

export function ParentReport({
  childName,
  weekSummary,
  quietDays,
  teacherRequest,
  homeTasks,
  lastVerification,
}: ParentReportProps) {
  const { t } = useLocale();
  return (
    <main className="athar-family">
      <h1>{childName}</h1>

      <section aria-labelledby="athar-week">
        <h2 id="athar-week">{t("family.thisWeek")}</h2>
        {weekSummary.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {/* Absence is reported explicitly. Silence would read as zero. */}
        {quietDays.map((day) => (
          <p key={day} className="athar-family__quiet">
            {t("family.noPractice", { date: day })}
          </p>
        ))}
      </section>

      {teacherRequest ? (
        <section aria-labelledby="athar-asked">
          <h2 id="athar-asked">{t("family.teacherAsked")}</h2>
          <p>{teacherRequest.text}</p>
          <p className="athar-family__attribution">
            — {teacherRequest.teacherName}, {teacherRequest.date}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="athar-tasks">
        <h2 id="athar-tasks">{t("family.homeTasks")}</h2>
        <ul>
          {homeTasks.map((task) => (
            <li key={task.id} data-done={task.done}>
              <span aria-hidden="true">{task.done ? "✓" : "○"}</span>{" "}
              {task.description}
              {/*
                Who assigned it and who checked it are both shown: a home
                task a parent ticked is not a teacher's verification, and
                the report must never let the two be confused.
              */}
              <span className="athar-family__assigned">
                {" · "}
                {t("family.assignedBy", { name: task.assignedByName })}
              </span>
              {task.checkedByName && task.checkedOn ? (
                <span className="athar-family__checked">
                  {" · "}
                  {t("family.checkedBy", {
                    name: task.checkedByName,
                    date: task.checkedOn,
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <p className="athar-family__verification">
        {lastVerification
          ? t("family.lastVerification", {
              date: lastVerification.date,
              decision: lastVerification.decision,
            })
          : t("evidence.notReviewed")}
      </p>
    </main>
  );
}
