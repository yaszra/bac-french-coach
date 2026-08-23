import { withTenant } from "../../db/tenant";
import { logger } from "../../observability/logger";
import { loadDailyReport, saveReportRun } from "../../../analytics/repo/report-repo";
import { loadSchoolOverview } from "../../../analytics/repo/school-repo";
import { buildTonight } from "../../../family/domain/tonight";
import { isKnownTimezone, isLocalEvening, localDate } from "./evening";
import { JOBS } from "../queue";

/**
 * Report jobs.
 *
 * Reports are jobs, never request-time work: a parent opening the app at
 * 21:40 should read something that was already computed, and a report that
 * failed should be visibly failed rather than quietly recomputed on demand into
 * something different.
 *
 * All three are idempotent. Each writes a ReportRun keyed by
 * (kind, scope, date), so a retry, a duplicate trigger and a manual re-run all
 * converge on one row.
 */

export type ReportJobData = { readonly organizationId: string; readonly at?: string };

/** The learner's own daily report. */
export async function runDailyReports(data: ReportJobData): Promise<void> {
  const now = data.at ? new Date(data.at) : new Date();
  const learners = await withTenant(data.organizationId, (tx) =>
    tx.learnerProfile.findMany({ select: { userId: true, timezone: true } }),
  );

  for (const learner of learners) {
    if (!isKnownTimezone(learner.timezone)) {
      logger.error({ learner: learner.userId, timezone: learner.timezone }, "unknown timezone; report skipped");
      continue;
    }
    const forDate = localDate(learner.timezone, now);
    await writeReport(data.organizationId, "daily_learner", learner.userId, forDate, async () =>
      loadDailyReport(data.organizationId, { learnerUserId: learner.userId, timezone: learner.timezone, forDate }, now),
    );
  }
}

/**
 * The family's nightly report — fired at THAT family's evening.
 *
 * The job runs hourly and does nothing for a learner whose local clock is not
 * yet at the evening hour. One global hour would deliver a Kuala Lumpur family
 * their child's evening over breakfast.
 */
export async function runNightlyFamilyReports(data: ReportJobData): Promise<void> {
  const now = data.at ? new Date(data.at) : new Date();
  const learners = await withTenant(data.organizationId, (tx) =>
    tx.learnerProfile.findMany({
      select: { userId: true, timezone: true, user: { select: { displayName: true } } },
    }),
  );

  for (const learner of learners) {
    if (!isKnownTimezone(learner.timezone)) {
      logger.error({ learner: learner.userId, timezone: learner.timezone }, "unknown timezone; family report skipped");
      continue;
    }
    if (!isLocalEvening(learner.timezone, now)) continue;

    const forDate = localDate(learner.timezone, now);
    await writeReport(data.organizationId, "nightly_parent", learner.userId, forDate, async () => {
      const report = await loadDailyReport(
        data.organizationId,
        { learnerUserId: learner.userId, timezone: learner.timezone, forDate },
        now,
      );
      return buildTonight({ report, childName: learner.user.displayName });
    });
  }
}

/** The school's weekly summary — aggregates only, never a child's work. */
export async function runSchoolWeekly(data: ReportJobData): Promise<void> {
  const now = data.at ? new Date(data.at) : new Date();
  const forDate = now.toISOString().slice(0, 10);
  const overview = await loadSchoolOverview(data.organizationId, now, 7);
  await saveReportRun({
    organizationId: data.organizationId,
    kind: "school_weekly",
    scopeType: "organization",
    scopeId: data.organizationId,
    forDate: new Date(`${forDate}T00:00:00Z`),
    state: "completed",
    payload: JSON.parse(JSON.stringify(overview)) as unknown,
    generatedAt: now,
  });
}

async function writeReport(
  organizationId: string,
  kind: string,
  learnerUserId: string,
  forDate: string,
  build: () => Promise<unknown>,
): Promise<void> {
  const at = new Date(`${forDate}T00:00:00Z`);
  try {
    await saveReportRun({
      organizationId,
      kind,
      scopeType: "learner",
      scopeId: learnerUserId,
      forDate: at,
      state: "running",
    });
    const payload = build ? await build() : null;
    await saveReportRun({
      organizationId,
      kind,
      scopeType: "learner",
      scopeId: learnerUserId,
      forDate: at,
      state: "completed",
      payload: JSON.parse(JSON.stringify(payload)) as unknown,
      generatedAt: new Date(),
    });
  } catch (error) {
    // A report that failed says so. A parent seeing "we could not build
    // tonight's report" is told the truth; a silently missing report is not.
    logger.error({ err: error, kind, learnerUserId, forDate }, "report failed");
    await saveReportRun({
      organizationId,
      kind,
      scopeType: "learner",
      scopeId: learnerUserId,
      forDate: at,
      state: "failed",
    });
    throw error;
  }
}

export const REPORT_JOBS = {
  [JOBS.reportDaily]: runDailyReports,
  [JOBS.reportNightlyFamily]: runNightlyFamilyReports,
  [JOBS.reportSchoolWeekly]: runSchoolWeekly,
} as const;
