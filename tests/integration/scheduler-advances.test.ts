import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { foldEventIntoMemoryState } from "../../src/modules/memory/repo/memory-projection";
import { registeredProjections } from "../../src/modules/platform/events/projection";
import "../../src/modules/platform/jobs/handlers/projection";

/**
 * The test that was missing.
 *
 * Every unit test passed while the memory projection was registered nowhere and
 * run by nothing: attempts appended events, the `Attempt` row appeared, today's
 * count moved — and the scheduler never advanced, so a unit stayed due forever
 * however well a learner answered. The whole product was quietly inert.
 *
 * Unit tests could not see it because each piece worked. What was missing was a
 * test that the pieces are CONNECTED, so that is what this is.
 */
const db = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_DATABASE_URL ?? "postgresql://itqan:itqan@localhost:5432/itqan" },
  },
});

const ORG = "itest_sched_org";
const LEARNER = "itest_sched_learner";
const UNIT = "b:78:1";

beforeAll(async () => {
  await db.organization.upsert({
    where: { id: ORG },
    create: { id: ORG, name: "Scheduler test", slug: "itest-sched", region: "eu", locale: "en" },
    update: {},
  });
  await db.user.upsert({
    where: { id: LEARNER },
    create: { id: LEARNER, organizationId: ORG, displayName: "Learner", locale: "en" },
    update: {},
  });
  await db.learnerProfile.upsert({
    where: { userId: LEARNER },
    create: { userId: LEARNER, organizationId: ORG, tier: "teen" },
    update: {},
  });
}, 60_000);

afterAll(async () => {
  await db.memoryState.deleteMany({ where: { organizationId: ORG } });
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.erasure_request_id = 'itest_sched_teardown'`);
    await tx.learningEvent.deleteMany({ where: { organizationId: ORG } });
  });
  await db.$executeRawUnsafe(`DELETE FROM erasure_log WHERE "requestId" = 'itest_sched_teardown'`);
  await db.learnerProfile.deleteMany({ where: { organizationId: ORG } });
  await db.user.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.memoryState.deleteMany({ where: { organizationId: ORG } });
});

describe("the projection is actually wired up", () => {
  it("is registered, so the catch-up sweep has something to run", () => {
    const names = registeredProjections().map((projection) => projection.name);
    expect(names).toContain("memory_state");
  });

  it("handles the events that carry evidence", () => {
    const memory = registeredProjections().find((projection) => projection.name === "memory_state");
    expect(memory?.handles).toEqual(expect.arrayContaining(["attempt.recorded", "verdict.given"]));
  });
});

describe("answering correctly moves the schedule", () => {
  it("turns an attempt into a due date further away than the last one", async () => {
    const first = new Date("2026-08-01T18:00:00Z");
    const second = new Date("2026-08-03T18:00:00Z");

    for (const [index, at] of [first, second].entries()) {
      await db.$transaction(async (tx) => {
        const event = await tx.learningEvent.create({
          data: {
            organizationId: ORG,
            learnerUserId: LEARNER,
            type: "attempt.recorded",
            unitId: UNIT,
            idempotencyKey: `itest_sched_${index}`,
            payload: { unitId: UNIT, unitKind: "ayah_body", retrievalType: "recall_first", grade: "good" },
            occurredAt: at,
            source: "web",
          },
        });
        // Exactly what the request path does: fold in the same transaction.
        await foldEventIntoMemoryState(
          {
            id: event.id,
            organizationId: ORG,
            learnerUserId: LEARNER,
            type: "attempt.recorded",
            unitId: UNIT,
            payload: event.payload,
            occurredAt: at,
            recordedAt: event.recordedAt,
          },
          tx as never,
        );
      });
    }

    const state = await db.memoryState.findUnique({
      where: { learnerUserId_unitId: { learnerUserId: LEARNER, unitId: UNIT } },
    });

    expect(state, "a practised unit must have memory state").not.toBeNull();
    expect(state!.reps).toBe(2);
    // The point of the whole thing: the unit is no longer due today.
    expect(state!.dueAt).not.toBeNull();
    expect(state!.dueAt!.getTime()).toBeGreaterThan(second.getTime());
    // And the interval grew, rather than the unit being re-asked at the same rate.
    const intervalDays = (state!.dueAt!.getTime() - second.getTime()) / 86_400_000;
    expect(intervalDays).toBeGreaterThan(1);
  }, 60_000);

  it("leaves a unit due when the answer was wrong", async () => {
    const at = new Date("2026-08-01T18:00:00Z");
    await db.$transaction(async (tx) => {
      const event = await tx.learningEvent.create({
        data: {
          organizationId: ORG,
          learnerUserId: LEARNER,
          type: "attempt.recorded",
          unitId: UNIT,
          idempotencyKey: "itest_sched_wrong",
          payload: { unitId: UNIT, unitKind: "ayah_body", retrievalType: "recall_first", grade: "again" },
          occurredAt: at,
          source: "web",
        },
      });
      await foldEventIntoMemoryState(
        {
          id: event.id,
          organizationId: ORG,
          learnerUserId: LEARNER,
          type: "attempt.recorded",
          unitId: UNIT,
          payload: event.payload,
          occurredAt: at,
          recordedAt: event.recordedAt,
        },
        tx as never,
      );
    });

    const state = await db.memoryState.findUnique({
      where: { learnerUserId_unitId: { learnerUserId: LEARNER, unitId: UNIT } },
    });
    // A wrong answer comes back soon. "Soon" is the scheduler's business; that
    // it comes back at all is this test's.
    const intervalDays = (state!.dueAt!.getTime() - at.getTime()) / 86_400_000;
    expect(intervalDays).toBeLessThan(2);
  }, 60_000);

  it("rolls the projection back with the event when the transaction fails", async () => {
    const at = new Date("2026-08-05T18:00:00Z");
    await expect(
      db.$transaction(async (tx) => {
        const event = await tx.learningEvent.create({
          data: {
            organizationId: ORG,
            learnerUserId: LEARNER,
            type: "attempt.recorded",
            unitId: UNIT,
            idempotencyKey: "itest_sched_rollback",
            payload: { unitId: UNIT, unitKind: "ayah_body", retrievalType: "recall_first", grade: "good" },
            occurredAt: at,
            source: "web",
          },
        });
        await foldEventIntoMemoryState(
          {
            id: event.id,
            organizationId: ORG,
            learnerUserId: LEARNER,
            type: "attempt.recorded",
            unitId: UNIT,
            payload: event.payload,
            occurredAt: at,
            recordedAt: event.recordedAt,
          },
          tx as never,
        );
        throw new Error("something later in the request failed");
      }),
    ).rejects.toThrow(/something later/);

    // Neither the event nor the state survived: a projection that claimed
    // something the history does not contain would be worse than either.
    const event = await db.learningEvent.findFirst({
      where: { organizationId: ORG, idempotencyKey: "itest_sched_rollback" },
    });
    const state = await db.memoryState.findUnique({
      where: { learnerUserId_unitId: { learnerUserId: LEARNER, unitId: UNIT } },
    });
    expect(event).toBeNull();
    expect(state).toBeNull();
  }, 60_000);
});
