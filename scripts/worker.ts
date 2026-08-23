/**
 * The worker process.
 *
 * In development the queue can run inside the web process; in production this
 * runs on its own, so a long report cannot compete with a learner's request for
 * the same event loop.
 *
 *   pnpm exec tsx scripts/worker.ts
 */
import { registerJobHandlers } from "../src/modules/platform/jobs/handlers";
import { getQueue, stopQueue } from "../src/modules/platform/jobs/queue";
import { SCHEDULES } from "../src/modules/platform/jobs/schedule";
import { logger } from "../src/modules/platform/observability/logger";

async function main(): Promise<void> {
  const queue = await getQueue();
  await registerJobHandlers();

  for (const schedule of SCHEDULES) {
    await queue.schedule(schedule.job, schedule.cron, {}, { tz: "UTC" });
    logger.info({ job: schedule.job, cron: schedule.cron }, schedule.description);
  }

  logger.info({ jobs: SCHEDULES.length }, "worker ready");

  const shutdown = async (signal: string): Promise<void> => {
    // Finish what is in flight rather than dropping it: a half-written report
    // that is retried is fine, one that vanishes is a family that heard nothing.
    logger.info({ signal }, "worker stopping gracefully");
    await stopQueue();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error({ err: error }, "worker failed to start");
  process.exit(1);
});
