import { JOBS } from "./queue";

/**
 * The recurring shape of a day at Itqān. Times are UTC; per-organisation local
 * scheduling is handled by each job reading the learner's timezone, so a family
 * in Casablanca and one in Kuala Lumpur both get "tonight's report" tonight.
 */
export type Schedule = {
  readonly job: string;
  readonly cron: string;
  readonly description: string;
};

export const SCHEDULES: readonly Schedule[] = [
  { job: JOBS.projectionAdvance, cron: "*/2 * * * *", description: "Keep projections close to the event stream" },
  { job: JOBS.memoryRecompute, cron: "15 1 * * *", description: "Nightly memory recompute and due-date refresh" },
  { job: JOBS.reportDaily, cron: "30 1 * * *", description: "Daily learner reports" },
  { job: JOBS.reportNightlyFamily, cron: "0 * * * *", description: "Family reports, sent at each family's evening" },
  { job: JOBS.reportSchoolWeekly, cron: "0 5 * * 1", description: "Weekly school summary" },
  { job: JOBS.audioPurge, cron: "0 3 * * *", description: "Purge child recordings past their retention" },
  { job: JOBS.backupVerify, cron: "0 4 * * *", description: "Verify last night's backup can be restored" },
];
