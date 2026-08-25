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

/**
 * What is scheduled, and what is deliberately not.
 *
 * Every entry here has a worker bound to it in `handlers/index.ts`. Two entries
 * used to exist with no worker at all — `memory.recompute` and
 * `ops.backup_verify` — so those jobs were created every night and expired
 * unworked. They are gone rather than stubbed:
 *
 *   · memory state is folded inline with the event that causes it, and the
 *     two-minute sweep catches anything a request path missed, so a nightly
 *     recompute has no work left to do;
 *   · the restore drill is `scripts/backup_verify.mjs`, an operator's job with
 *     its own database and its own output, not something the web worker can
 *     honestly claim to have done.
 *
 * The `*.tick` jobs are the fan-out step: a cron trigger has no organisation,
 * and the work below it is per-organisation.
 */
export const SCHEDULES: readonly Schedule[] = [
  { job: JOBS.projectionAdvance, cron: "*/2 * * * *", description: "Keep projections close to the event stream" },
  { job: JOBS.reportDailyTick, cron: "30 1 * * *", description: "Daily learner reports, per organisation" },
  { job: JOBS.reportNightlyFamilyTick, cron: "0 * * * *", description: "Family reports, sent at each family's evening" },
  { job: JOBS.reportSchoolWeeklyTick, cron: "0 5 * * 1", description: "Weekly school summary, per organisation" },
  { job: JOBS.audioPurgeTick, cron: "0 3 * * *", description: "Purge child recordings past their retention" },
];
