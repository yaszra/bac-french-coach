"use client";

import { useTransition } from "react";
import { Button, Tab, TabList, TabPanel, Tabs } from "../../design/ui/controls";
import { Badge, EmptyState, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../design/ui/display";
import { InkLegend, MushafPage, PageFrame, type MushafLine } from "../../design/ui/mushaf";
import { useSurface } from "../../design/theme/ThemeProvider";
import { isMeasured, type Measured } from "../../analytics/domain/denominator";
import { approveGuardianClaim } from "../actions/approve-claim";
import styles from "./TeacherConsole.module.css";

/**
 * One student, five tabs, and not one fabricated number.
 *
 * Every rate on this page arrives as a `Measured` from the analytics domain,
 * which is either a value WITH its denominator or the honest statement that
 * too little has been recorded to claim anything. There is no branch here that
 * turns a thin denominator into a small percentage, because a small percentage
 * is a claim about a child and four observations do not support one.
 */
export type StudentProfileViewProps = {
  readonly learner: {
    readonly userId: string;
    readonly displayName: string;
    readonly tier: string;
    readonly trackedUnits: number;
    readonly verifiedUnits: number;
    readonly dueNow: number;
    readonly lastActivityAt: string | null;
  };
  readonly attemptSuccess: Measured;
  readonly verdictPass: Measured;
  readonly lines: readonly MushafLine[];
  readonly page: number | null;
  readonly weakJoins: readonly { readonly unitId: string; readonly severity: number }[];
  readonly attempts: readonly {
    readonly id: string;
    readonly unitId: string;
    readonly retrievalType: string;
    readonly grade: string;
    readonly occurredAt: string;
  }[];
  readonly verdicts: readonly {
    readonly id: string;
    readonly verdict: string;
    readonly corrections: number;
    readonly decidedAt: string;
    readonly decidedByName: string;
    readonly evidenceKind: string | null;
  }[];
  readonly assignments: readonly {
    readonly id: string;
    readonly track: string;
    readonly units: number;
    readonly dueAt: string | null;
    readonly completedAt: string | null;
  }[];
  readonly family: readonly {
    readonly id: string;
    readonly guardianName: string;
    readonly state: "claimed" | "approved" | "revoked";
    readonly canTutor: boolean;
  }[];
};

function MeasuredLine({ measured, labelKey }: { readonly measured: Measured; readonly labelKey: string }) {
  const { t } = useSurface();
  return isMeasured(measured) ? (
    <p className={styles.meta}>
      {t(labelKey, {
        percent: Math.round(measured.value * 100),
        denominator: measured.denominator,
      })}
    </p>
  ) : (
    <p className={styles.meta}>{t("teacher.students.notEnough", { needed: measured.needed })}</p>
  );
}

export function StudentProfileView(props: StudentProfileViewProps) {
  const { t, locale } = useSurface();
  const { learner } = props;
  const [pending, startTransition] = useTransition();

  const approve = (relationshipId: string): void => {
    startTransition(async () => {
      await approveGuardianClaim({ relationshipId, canTutor: false });
    });
  };

  const date = (value: string): string => new Date(value).toLocaleString(locale);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{t("teacher.students.title")}</p>
          <h1 className={styles.title}>{learner.displayName}</h1>
        </div>
        <p className={styles.meta}>
          {learner.lastActivityAt === null
            ? t("teacher.students.neverActive")
            : t("teacher.students.lastActivity", { date: date(learner.lastActivityAt) })}
        </p>
      </div>

      <Tabs defaultValue="today">
        <TabList aria-label={t("teacher.students.title")}>
          <Tab value="today">{t("teacher.students.tabToday")}</Tab>
          <Tab value="memory">{t("teacher.students.tabMemory")}</Tab>
          <Tab value="history">{t("teacher.students.tabHistory")}</Tab>
          <Tab value="assignments">{t("teacher.students.tabAssignments")}</Tab>
          <Tab value="family">{t("teacher.students.tabFamily")}</Tab>
        </TabList>

        <TabPanel value="today">
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>{t("teacher.students.todayHeading")}</h2>
            {learner.trackedUnits === 0 ? (
              <EmptyState variant="not-yet-recorded" description={t("teacher.students.nothingToday")} />
            ) : (
              <dl className={styles.definitionList}>
                <dt>{t("teacher.students.unitsTracked", { count: learner.trackedUnits })}</dt>
                <dd>{learner.trackedUnits}</dd>
                <dt>{t("teacher.students.unitsVerified", { count: learner.verifiedUnits })}</dt>
                <dd>{learner.verifiedUnits}</dd>
                <dt>{t("teacher.students.dueNow", { count: learner.dueNow })}</dt>
                <dd>{learner.dueNow}</dd>
              </dl>
            )}
          </section>
        </TabPanel>

        <TabPanel value="memory">
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>{t("teacher.students.memoryHeading")}</h2>
            <p className={styles.sectionNote}>{t("teacher.students.memoryInk")}</p>
            {props.lines.length === 0 ? (
              <EmptyState variant="not-yet-recorded" />
            ) : (
              <>
                <PageFrame page={props.page ?? 0}>
                  <MushafPage lines={props.lines} />
                </PageFrame>
                <InkLegend />
              </>
            )}
            <h3 className={styles.sectionTitle}>{t("teacher.students.weakJoins")}</h3>
            {props.weakJoins.length === 0 ? (
              <p className={styles.meta}>{t("teacher.students.noWeakJoins")}</p>
            ) : (
              <ul className={styles.checklist}>
                {props.weakJoins.map((join) => (
                  <li key={join.unitId} className={styles.checkRow}>
                    <Badge tone="caution" dot>
                      {Math.round(join.severity * 100)}
                    </Badge>
                    <span className={styles.checkLabel}>{join.unitId}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabPanel>

        <TabPanel value="history">
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>{t("teacher.students.historyHeading")}</h2>
            <MeasuredLine measured={props.attemptSuccess} labelKey="teacher.students.successRate" />
            <MeasuredLine measured={props.verdictPass} labelKey="teacher.students.verdictRate" />

            {/* A caption names its table. These captions used to be the
                EMPTY-state sentence, so a screen reader announced "No verdicts
                recorded yet" over a table full of verdicts, and the column
                headers borrowed keys from unrelated screens. */}
            {props.verdicts.length === 0 ? (
              <p className={styles.meta}>{t("teacher.students.noVerdicts")}</p>
            ) : (
              <Table caption={t("teacher.students.verdictsTable")} captionHidden>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{t("teacher.students.colVerdict")}</TableHeaderCell>
                    <TableHeaderCell numeric>{t("teacher.students.colMarks")}</TableHeaderCell>
                    <TableHeaderCell>{t("teacher.students.colEvidence")}</TableHeaderCell>
                    <TableHeaderCell>{t("teacher.students.colDecided")}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {props.verdicts.map((verdict) => (
                    <TableRow key={verdict.id}>
                      <TableCell>{t(`teacher.verify.${verdictKey(verdict.verdict)}`)}</TableCell>
                      <TableCell numeric>{verdict.corrections}</TableCell>
                      <TableCell>
                        {verdict.evidenceKind === "in_person_confirmation"
                          ? t("teacher.students.heardInPerson")
                          : "—"}
                      </TableCell>
                      <TableCell>{date(verdict.decidedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {props.attempts.length === 0 ? (
              <p className={styles.meta}>{t("teacher.students.noAttempts")}</p>
            ) : (
              <Table caption={t("teacher.students.attemptsTable")} captionHidden maxHeight="24rem">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{t("teacher.students.colUnit")}</TableHeaderCell>
                    <TableHeaderCell>{t("teacher.students.colExercise")}</TableHeaderCell>
                    <TableHeaderCell>{t("teacher.students.colWhen")}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {props.attempts.map((attempt) => (
                    <TableRow key={attempt.id}>
                      <TableCell>{attempt.unitId}</TableCell>
                      <TableCell>{attempt.retrievalType}</TableCell>
                      <TableCell>{date(attempt.occurredAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </TabPanel>

        <TabPanel value="assignments">
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>{t("teacher.students.assignmentsHeading")}</h2>
            {props.assignments.length === 0 ? (
              <EmptyState description={t("teacher.students.noAssignments")} />
            ) : (
              <ul className={styles.checklist}>
                {props.assignments.map((assignment) => (
                  <li key={assignment.id} className={styles.checkRow}>
                    <Badge tone={assignment.completedAt === null ? "neutral" : "success"} dot>
                      {t(`teacher.assign.track${capitalise(assignment.track)}`)}
                    </Badge>
                    <span className={styles.checkLabel}>
                      {t("teacher.assign.units", { count: assignment.units })}
                      {assignment.dueAt === null
                        ? ` · ${t("teacher.assign.noDue")}`
                        : ` · ${t("teacher.assign.reviewDue", { date: date(assignment.dueAt) })}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabPanel>

        <TabPanel value="family">
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>{t("teacher.students.familyHeading")}</h2>
            {props.family.length === 0 ? (
              <EmptyState description={t("teacher.students.noFamily")} />
            ) : (
              <ul className={styles.checklist}>
                {props.family.map((link) => (
                  <li key={link.id} className={styles.checkRow}>
                    <Badge tone={link.state === "approved" ? "success" : link.state === "claimed" ? "caution" : "neutral"} dot>
                      {t(`teacher.students.link${capitalise(link.state)}`)}
                    </Badge>
                    <span className={styles.checkLabel}>
                      {link.guardianName}
                      {link.canTutor ? ` · ${t("teacher.students.canTutor")}` : ""}
                    </span>
                    {link.state === "claimed" ? (
                      <Button size="sm" loading={pending} onClick={() => approve(link.id)}>
                        {t("teacher.students.approve")}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabPanel>
      </Tabs>
    </div>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function verdictKey(verdict: string): string {
  return verdict === "needs_work" ? "needsWork" : verdict === "not_attempted" ? "notAttempted" : "passed";
}
