import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enqueue, getQueue, stopQueue, JOBS, work } from "../../src/modules/platform/jobs/queue";

/**
 * The queue is where a promise to a parent becomes a thing that actually
 * happens. These tests check the properties that matter operationally: a job
 * runs, a duplicate does not pile up, and a job that keeps failing ends up
 * somewhere visible rather than nowhere.
 */
beforeAll(async () => {
  await getQueue();
}, 60_000);

afterAll(async () => {
  await stopQueue();
});

describe("job queue", () => {
  it("runs an enqueued job", async () => {
    const seen: string[] = [];
    await work<{ learnerId: string }>(JOBS.reportDaily, async (data) => {
      seen.push(data.learnerId);
    });
    await enqueue(JOBS.reportDaily, { learnerId: "u_jobs_1" });

    await waitFor(() => seen.includes("u_jobs_1"), 15_000);
    expect(seen).toContain("u_jobs_1");
  }, 30_000);

  it("collapses duplicates through a singleton key", async () => {
    const first = await enqueue(
      JOBS.memoryRecompute,
      { learnerId: "u_jobs_2" },
      { singletonKey: "u_jobs_2:2026-08-23" },
    );
    const second = await enqueue(
      JOBS.memoryRecompute,
      { learnerId: "u_jobs_2" },
      { singletonKey: "u_jobs_2:2026-08-23" },
    );
    expect(first).toBeTruthy();
    expect(second).toBeNull();
  }, 30_000);

  it("gives every queue a dead-letter queue, so failures are visible", async () => {
    const boss = await getQueue();
    const deadLetter = await boss.getQueue(`${JOBS.reportDaily}.failed`);
    expect(deadLetter).not.toBeNull();

    const main = await boss.getQueue(JOBS.reportDaily);
    expect(main?.deadLetter).toBe(`${JOBS.reportDaily}.failed`);
    expect(main?.retryLimit).toBeGreaterThan(0);
  }, 30_000);
});

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
