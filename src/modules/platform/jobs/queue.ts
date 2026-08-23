import PgBoss from "pg-boss";
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

let boss: PgBoss | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (boss) return boss;
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to start the job queue");

  boss = new PgBoss({
    connectionString,
    schema: "pgboss",
    retryLimit: 5,
    retryBackoff: true,
    // Keep finished jobs long enough to answer "did that report actually run?"
    archiveCompletedAfterSeconds: 60 * 60 * 24 * 7,
  });
  boss.on("error", (error) => logger.error({ err: error }, "job queue error"));
  await boss.start();
  for (const queue of Object.values(JOBS)) {
    await boss.createQueue(queue);
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
  return queue.work<T>(name, { batchSize: options?.batchSize ?? 1 }, async (jobs) => {
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
