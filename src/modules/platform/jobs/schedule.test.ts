import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SCHEDULES } from "./schedule";
import { JOBS } from "./queue";

/**
 * Every scheduled job has a worker.
 *
 * Two did not. `memory.recompute` and `ops.backup_verify` were scheduled
 * nightly and bound to nothing, so pg-boss created a job every night and let
 * it expire unworked — the same "registered nowhere, run by nothing" shape
 * that had already frozen the memory projection, one layer up. Nothing could
 * see it: the schedule was well-formed, the queue was healthy, and the work
 * simply never happened.
 *
 * The registration file is read as text rather than executed because binding a
 * handler opens a real queue connection. That is a weaker check than calling
 * it, and it is the one that can run in a unit test — the integration suite
 * exercises the queue itself.
 */
const registrations = readFileSync(
  new URL("./handlers/index.ts", import.meta.url),
  "utf8",
);

const nameOf = new Map<string, string>(
  Object.entries(JOBS).map(([constant, name]) => [name as string, constant]),
);

describe("the schedule", () => {
  it("schedules nothing that has no worker", () => {
    const unbound = SCHEDULES.filter((schedule) => {
      const constant = nameOf.get(schedule.job);
      return constant === undefined || !registrations.includes(`JOBS.${constant},`);
    });
    expect(
      unbound.map((schedule) => schedule.job),
      "a scheduled job with no worker runs every night and does nothing",
    ).toEqual([]);
  });

  it("gives every entry a cron and a description a person can read", () => {
    for (const schedule of SCHEDULES) {
      expect(schedule.cron.trim().split(/\s+/u)).toHaveLength(5);
      expect(schedule.description.length).toBeGreaterThan(10);
    }
  });

  it("schedules per-organisation work through a tick, never directly", () => {
    /* A cron firing carries no organisation. Scheduling a per-organisation job
       directly is what produced `organizationId: undefined`, a tenant set to
       the literal string "undefined", and a job that reported success having
       matched no rows. */
    const perOrganization = [
      JOBS.reportDaily,
      JOBS.reportNightlyFamily,
      JOBS.reportSchoolWeekly,
      JOBS.audioPurge,
    ];
    for (const job of perOrganization) {
      expect(SCHEDULES.some((schedule) => schedule.job === job)).toBe(false);
    }
  });
});
