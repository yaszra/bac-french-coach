import { PgBoss, type Job } from "pg-boss";
import { logger } from "../observability/logger";

/**
 * Background work runs on pg-boss — one Postgres, one backup, one restore
 * story. Every job is idempotent, retried with backoff, and dead-lettered
 * rather than dropped: a nightly report that fails is a report a parent did not
 * get, and that must be visible, not silent.
 */
export const JOBS = {
  reportDaily: "report.daily",
  reportNightlyFamily: "report.nightly_family",
  reportSchoolWeekly: "report.school_weekly",
  memoryRecompute: "memory.recompute",
  projectionAdvance: "projection.advance",
  offlinePackBuild: "offline.pack_build",
  dataExport: "privacy.export",
  dataErasure: "privacy.erasure",
  audioPurge: "privacy.audio_purge",
  copilotSummary: "copilot.summary",
  backupVerify: "ops.backup_verify",
} as const;
export type JobName = (typeof JOBS)[keyof typeof JOBS];

/**
 * How each queue behaves when the same work is asked for twice.
 *
 * `stately` — one job per state per singleton key: tonight's report for one
 *   learner is one report, however many times the trigger fires.
 * `short`   — one job queued at a time: there is no value in stacking six
 *   projection sweeps, the next one will catch up anyway.
 * `standard` — every request is its own work: two people asking to export
 *   their data are two exports.
 */
const QUEUE_POLICY: Readonly<Record<JobName, "standard" | "short" | "stately">> = {
  [JOBS.reportDaily]: "stately",
  [JOBS.reportNightlyFamily]: "stately",
  [JOBS.reportSchoolWeekly]: "stately",
  [JOBS.memoryRecompute]: "stately",
  [JOBS.offlinePackBuild]: "stately",
  [JOBS.projectionAdvance]: "short",
  [JOBS.audioPurge]: "short",
  [JOBS.backupVerify]: "short",
  [JOBS.dataExport]: "standard",
  [JOBS.dataErasure]: "standard",
  [JOBS.copilotSummary]: "standard",
};

let boss: PgBoss | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (boss) return boss;
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to start the job queue");

  boss = new PgBoss({ connectionString, schema: "pgboss" });
  boss.on("error", (error: Error) => logger.error({ err: error }, "job queue error"));
  await boss.start();

  // Retry policy and retention belong to the queue, so every producer inherits
  // them and no caller can quietly enqueue work that gives up after one try.
  // A job that exhausts its retries lands in a dead-letter queue rather than
  // disappearing: a nightly report that never ran must be visible.
  for (const queue of Object.values(JOBS)) {
    const deadLetterConfig = { retryLimit: 0, retentionSeconds: 60 * 60 * 24 * 30 } as const;
    const queueConfig = {
      policy: QUEUE_POLICY[queue],
      retryLimit: 5,
      retryBackoff: true,
      retryDelay: 30,
      retryDelayMax: 3600,
      deadLetter: `${queue}.failed`,
      // Keep finished jobs long enough to answer "did that report actually run?"
      retentionSeconds: 60 * 60 * 24 * 7,
    } as const;

    // createQueue is idempotent but does not reconfigure a queue that already
    // exists, so a deployment that changed retry or retention would silently
    // keep the old settings. Create, then update the mutable parts.
    await boss.createQueue(`${queue}.failed`, deadLetterConfig);
    await boss.createQueue(queue, queueConfig);

    const { policy: _createdPolicy, ...mutable } = queueConfig;
    await boss.updateQueue(`${queue}.failed`, deadLetterConfig);
    await boss.updateQueue(queue, mutable);

    // A policy cannot be changed after creation, so drift here is not something
    // to fix quietly: it means this queue is not deduplicating the way the code
    // believes it is. Say so, loudly, with the remedy.
    const existing = await boss.getQueue(queue);
    if (existing && existing.policy !== queueConfig.policy) {
      logger.error(
        { queue, expected: queueConfig.policy, actual: existing.policy },
        "queue policy drift: pg-boss cannot change a policy in place. Drain this queue and recreate it during a maintenance window, or duplicate work will be enqueued.",
      );
    }
  }
  return boss;
}

export async function stopQueue(): Promise<void> {
  await boss?.stop({ graceful: true });
  boss = null;
}

/**
 * Enqueue with a singleton key so the same logical job cannot pile up: one
 * daily report per learner per day, however many times the trigger fires.
 */
export async function enqueue<T extends object>(
  name: JobName,
  data: T,
  options?: { readonly singletonKey?: string; readonly startAfter?: Date; readonly priority?: number },
): Promise<string | null> {
  const queue = await getQueue();
  return queue.send(name, data, {
    ...(options?.singletonKey ? { singletonKey: options.singletonKey } : {}),
    ...(options?.startAfter ? { startAfter: options.startAfter } : {}),
    ...(options?.priority !== undefined ? { priority: options.priority } : {}),
  });
}

export type JobHandler<T extends object> = (data: T) => Promise<void>;

export async function work<T extends object>(
  name: JobName,
  handler: JobHandler<T>,
  options?: { readonly batchSize?: number },
): Promise<string> {
  const queue = await getQueue();
  return queue.work<T>(name, { batchSize: options?.batchSize ?? 1 }, async (jobs: Job<T>[]) => {
    for (const job of jobs) {
      const started = Date.now();
      try {
        await handler(job.data);
        logger.info({ job: name, id: job.id, ms: Date.now() - started }, "job completed");
      } catch (error) {
        // Rethrow so pg-boss retries, then dead-letters. Never swallow.
        logger.error({ job: name, id: job.id, err: error }, "job failed");
        throw error;
      }
    }
  });
}
