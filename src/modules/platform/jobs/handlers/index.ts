import { JOBS, work } from "../queue";
import { runDailyReports, runNightlyFamilyReports, runSchoolWeekly, type ReportJobData } from "./reports";
import { runAudioPurge, runDataErasure, runDataExport, type PrivacyJobData } from "./privacy";
import { advanceProjections, rebuildProjections } from "./projection";
import { fanOutToOrganizations } from "./fanout";

/**
 * Binding the handlers to their queues. One place, so "which job actually has a
 * worker?" has an answer that can be read rather than inferred.
 */
export async function registerJobHandlers(): Promise<void> {
  await work<{ rebuild?: boolean }>(JOBS.projectionAdvance, advanceProjections);
  await work<ReportJobData>(JOBS.reportDaily, runDailyReports);
  await work<ReportJobData>(JOBS.reportNightlyFamily, runNightlyFamilyReports);
  await work<ReportJobData>(JOBS.reportSchoolWeekly, runSchoolWeekly);
  await work<PrivacyJobData>(JOBS.dataExport, runDataExport);
  await work<PrivacyJobData>(JOBS.dataErasure, runDataErasure);
  await work<{ organizationId: string; at?: string }>(JOBS.audioPurge, async (data) => {
    await runAudioPurge(data);
  });

  /* The ticks. Each turns one cron firing into one job per school; without
     them the scheduled jobs ran with no organisation at all and did nothing. */
  await work<Record<string, never>>(JOBS.reportDailyTick, async () => {
    await fanOutToOrganizations(JOBS.reportDaily);
  });
  await work<Record<string, never>>(JOBS.reportNightlyFamilyTick, async () => {
    await fanOutToOrganizations(JOBS.reportNightlyFamily);
  });
  await work<Record<string, never>>(JOBS.reportSchoolWeeklyTick, async () => {
    await fanOutToOrganizations(JOBS.reportSchoolWeekly);
  });
  await work<Record<string, never>>(JOBS.audioPurgeTick, async () => {
    await fanOutToOrganizations(JOBS.audioPurge);
  });
}

export { fanOutToOrganizations, organizationIds } from "./fanout";
export {
  advanceProjections,
  rebuildProjections,
  runDailyReports,
  runNightlyFamilyReports,
  runSchoolWeekly,
  runAudioPurge,
  runDataErasure,
  runDataExport,
};
export { useObjectStore } from "./privacy";
export { EVENING_HOUR, isLocalEvening, isKnownTimezone, localDate, localHour } from "./evening";
