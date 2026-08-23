import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runDataErasure, runDataExport, useObjectStore } from "../../src/modules/platform/jobs/handlers";
import { MemoryObjectStore } from "../../src/modules/platform/storage/memory-store";

/**
 * Erasure has to be true at the database, not merely intended by the code.
 *
 * Two guarantees are proven here against a real Postgres:
 *   · The learning log stays append-only for everyone else — a plain DELETE
 *     raises, and no amount of application code can talk its way past it.
 *   · The erasure job removes the subject's history through the NAMED path,
 *     and the database itself records every removed row in erasure_log against
 *     the DataRequest that authorised it.
 *
 * If the second test passed while erasure_log stayed empty, the product would
 * be deleting children's data with no record of having done so — which is the
 * failure this whole design exists to prevent.
 */
const DIRECT = process.env.DIRECT_DATABASE_URL ?? "postgresql://itqan:itqan@localhost:5432/itqan";

const db = new PrismaClient({ datasources: { db: { url: DIRECT } } });

const ORG = "itest_privacy_org";
const SUBJECT = "itest_privacy_learner";
const GUARDIAN = "itest_privacy_guardian";

async function seed(): Promise<void> {
  await db.organization.upsert({
    where: { id: ORG },
    create: { id: ORG, name: "Privacy test", slug: "itest-privacy", region: "eu", locale: "en" },
    update: {},
  });
  for (const [id, name] of [
    [SUBJECT, "Subject"],
    [GUARDIAN, "Guardian"],
  ] as const) {
    await db.user.upsert({
      where: { id },
      create: { id, organizationId: ORG, displayName: name, locale: "en" },
      update: {},
    });
  }
  await db.learnerProfile.upsert({
    where: { userId: SUBJECT },
    create: { userId: SUBJECT, organizationId: ORG, tier: "kids", timezone: "Europe/Paris" },
    update: {},
  });

  for (let i = 0; i < 3; i += 1) {
    await db.learningEvent.upsert({
      where: { organizationId_idempotencyKey: { organizationId: ORG, idempotencyKey: `itest-privacy-${i}` } },
      create: {
        organizationId: ORG,
        learnerUserId: SUBJECT,
        type: "attempt.recorded",
        unitId: `b:78:${i + 1}`,
        idempotencyKey: `itest-privacy-${i}`,
        payload: { unitId: `b:78:${i + 1}`, unitKind: "ayah_body", grade: "good", retrievalType: "recall_first" },
        occurredAt: new Date(Date.UTC(2026, 7, 20, 17, 0, i)),
      },
      update: {},
    });
  }
  await db.attempt.create({
    data: {
      organizationId: ORG,
      learnerUserId: SUBJECT,
      unitId: "b:78:1",
      retrievalType: "recall_first",
      grade: "good",
      occurredAt: new Date(Date.UTC(2026, 7, 20, 17, 0, 0)),
    },
  });
  await db.memoryState.upsert({
    where: { learnerUserId_unitId: { learnerUserId: SUBJECT, unitId: "b:78:1" } },
    create: { organizationId: ORG, learnerUserId: SUBJECT, unitId: "b:78:1", unitKind: "ayah_body" },
    update: {},
  });
  await db.consentRecord.upsert({
    where: { learnerUserId_purpose: { learnerUserId: SUBJECT, purpose: "voice_recording" } },
    create: {
      organizationId: ORG,
      learnerUserId: SUBJECT,
      purpose: "voice_recording",
      granted: true,
      grantedByUserId: GUARDIAN,
    },
    update: {},
  });
}

beforeAll(async () => {
  useObjectStore(new MemoryObjectStore());
  await seed();
}, 60_000);

afterAll(async () => {
  // Even the fixture leaves through the audited path — there is no other way to
  // remove learning history, including our own test data.
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.erasure_request_id = 'itest_privacy_teardown'`);
    await tx.learningEvent.deleteMany({ where: { organizationId: ORG } });
    await tx.user.deleteMany({ where: { organizationId: ORG } });
    await tx.organization.deleteMany({ where: { id: ORG } });
  });
  await db.$executeRawUnsafe(`DELETE FROM erasure_log WHERE "requestId" LIKE 'itest_privacy%'`);
  await db.$disconnect();
});

describe("the append-only guarantee", () => {
  it("refuses a delete that names no authorising request", async () => {
    await expect(
      db.learningEvent.deleteMany({ where: { learnerUserId: SUBJECT } }),
    ).rejects.toThrow(/append-only/);
  });
});

describe("erasure through the audited path", () => {
  it("removes the subject's history and records every removed row", async () => {
    const request = await db.dataRequest.create({
      data: {
        organizationId: ORG,
        subjectUserId: SUBJECT,
        kind: "erasure",
        state: "received",
        requestedBy: GUARDIAN,
      },
      select: { id: true },
    });

    const before = await db.learningEvent.count({ where: { learnerUserId: SUBJECT } });
    expect(before).toBe(3);

    await runDataErasure({ organizationId: ORG, requestId: request.id });

    // The data is gone…
    expect(await db.learningEvent.count({ where: { learnerUserId: SUBJECT } })).toBe(0);
    expect(await db.attempt.count({ where: { learnerUserId: SUBJECT } })).toBe(0);
    expect(await db.memoryState.count({ where: { learnerUserId: SUBJECT } })).toBe(0);
    expect(await db.consentRecord.count({ where: { learnerUserId: SUBJECT } })).toBe(0);

    // …and the removal is itself a permanent record, written by the database.
    const log = await db.erasureLog.findMany({ where: { requestId: request.id } });
    expect(log).toHaveLength(before);
    expect(new Set(log.map((row) => row.tableName))).toEqual(new Set(["learning_event"]));
    expect(new Set(log.map((row) => row.operation))).toEqual(new Set(["DELETE"]));

    const after = await db.dataRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.state).toBe("completed");
    expect(after.completedAt).not.toBeNull();
  }, 60_000);

  it("fails visibly, and says why, when the request does not exist", async () => {
    const request = await db.dataRequest.create({
      data: {
        organizationId: ORG,
        subjectUserId: SUBJECT,
        kind: "export",
        state: "received",
        requestedBy: GUARDIAN,
      },
      select: { id: true },
    });
    // An export request handed to the erasure job is a mistake, not a licence.
    await expect(runDataErasure({ organizationId: ORG, requestId: request.id })).rejects.toThrow();
    const after = await db.dataRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.state).toBe("failed");
    expect(after.failureReason).toContain("not an erasure");
  }, 60_000);
});

describe("export", () => {
  it("writes a real object and records its key, or fails visibly", async () => {
    await seed();
    const request = await db.dataRequest.create({
      data: {
        organizationId: ORG,
        subjectUserId: SUBJECT,
        kind: "export",
        state: "received",
        requestedBy: GUARDIAN,
      },
      select: { id: true },
    });

    await runDataExport({ organizationId: ORG, requestId: request.id });

    const after = await db.dataRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.state).toBe("completed");
    expect(after.resultObjectKey).toMatch(/^export\//);
  }, 60_000);
});
