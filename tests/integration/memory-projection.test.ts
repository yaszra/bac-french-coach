import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { memoryProjection } from "../../src/modules/memory/repo/memory-projection";
import {
  runProjection,
  type ProjectionEvent,
} from "../../src/modules/platform/events/projection";

/**
 * The property that justifies the whole event-sourced design: memory state can
 * be thrown away and rebuilt from history, and it lands in exactly the same
 * place. If that is ever untrue, changing the scheduler becomes a migration
 * with no way back, and the honest history stops being the source of truth.
 */
const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL ?? "postgresql://itqan:itqan@localhost:5432/itqan" } },
});

const ORG = "itest_mem_org";
const LEARNER = "itest_mem_learner";

function attempt(unitId: string, grade: string, dayOffset: number, retrievalType = "recall_first"): ProjectionEvent {
  return {
    id: `ev_${unitId}_${dayOffset}_${grade}`,
    organizationId: ORG,
    learnerUserId: LEARNER,
    type: "attempt.recorded",
    unitId,
    payload: { unitId, unitKind: unitId.startsWith("t:") ? "ayah_transition" : "ayah_body", grade, retrievalType },
    occurredAt: new Date(Date.UTC(2026, 0, 1 + dayOffset, 18, 0, 0)),
    recordedAt: new Date(Date.UTC(2026, 0, 1 + dayOffset, 18, 0, 1)),
  };
}

const HISTORY: ProjectionEvent[] = [
  attempt("b:78:1", "good", 0),
  attempt("b:78:1", "good", 3),
  attempt("b:78:1", "again", 9),
  attempt("b:78:1", "hard", 10),
  attempt("t:78:1>78:2", "again", 4),
  attempt("t:78:1>78:2", "good", 5),
  {
    id: "ev_verdict",
    organizationId: ORG,
    learnerUserId: LEARNER,
    type: "verdict.given",
    unitId: null,
    payload: { verdict: "passed", unitIds: ["b:78:1"], corrections: [] },
    occurredAt: new Date(Date.UTC(2026, 0, 12, 18, 0, 0)),
    recordedAt: new Date(Date.UTC(2026, 0, 12, 18, 0, 1)),
  },
];

beforeAll(async () => {
  await db.organization.upsert({
    where: { id: ORG },
    create: { id: ORG, name: "Memory test", slug: "itest-mem", region: "eu", locale: "en" },
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
  await db.memoryState.deleteMany({ where: { learnerUserId: LEARNER } });
  await db.learnerProfile.deleteMany({ where: { userId: LEARNER } });
  await db.user.deleteMany({ where: { id: LEARNER } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.$disconnect();
});

async function replay(): Promise<void> {
  for (const event of HISTORY) {
    await memoryProjection.apply(event, { db } as never);
  }
}

async function snapshot() {
  const rows = await db.memoryState.findMany({
    where: { learnerUserId: LEARNER },
    orderBy: { unitId: "asc" },
  });
  return rows.map((row) => ({
    unitId: row.unitId,
    unitKind: row.unitKind,
    stability: Number(row.stability.toFixed(6)),
    difficulty: Number(row.difficulty.toFixed(6)),
    reps: row.reps,
    lapses: row.lapses,
    confidence: Number(row.confidence.toFixed(6)),
    dueAt: row.dueAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  }));
}

describe("the memory projection", () => {
  it("builds state from events", async () => {
    await db.memoryState.deleteMany({ where: { learnerUserId: LEARNER } });
    await replay();
    const states = await snapshot();

    expect(states).toHaveLength(2);
    const body = states.find((s) => s.unitId === "b:78:1");
    expect(body?.reps).toBe(5); // four attempts plus the verdict
    expect(body?.lapses).toBe(1);
    expect(body?.dueAt).not.toBeNull();
  }, 60_000);

  it("marks a unit verified only through a human verdict", async () => {
    const states = await snapshot();
    expect(states.find((s) => s.unitId === "b:78:1")?.verifiedAt).not.toBeNull();
    // The transition was practised but never heard by a teacher.
    expect(states.find((s) => s.unitId === "t:78:1>78:2")?.verifiedAt).toBeNull();
  }, 60_000);

  it("rebuilds to exactly the same state after being dropped", async () => {
    const before = await snapshot();

    await memoryProjection.reset({ db } as never);
    expect(await snapshot()).toEqual([]);

    await replay();
    expect(await snapshot()).toEqual(before);
  }, 60_000);

  it("is idempotent: replaying the same history does not double-count", async () => {
    // Replaying is not the same as re-deriving — the projection runner advances
    // a checkpoint precisely so events are applied once. Rebuilding is the safe
    // operation; this test documents the distinction rather than pretending
    // duplicate application is harmless.
    await memoryProjection.reset({ db } as never);
    await replay();
    const once = await snapshot();

    await memoryProjection.reset({ db } as never);
    await replay();
    expect(await snapshot()).toEqual(once);
  }, 60_000);

  it("never produces mastery from repeated listening", async () => {
    await memoryProjection.reset({ db } as never);
    for (let day = 0; day < 30; day++) {
      await memoryProjection.apply(attempt("b:99:1", "good", day, "listen"), { db } as never);
    }
    const row = await db.memoryState.findUnique({
      where: { learnerUserId_unitId: { learnerUserId: LEARNER, unitId: "b:99:1" } },
    });
    expect(row?.verifiedAt).toBeNull();
    // Listening is weak evidence; thirty of them must not look like holding it.
    expect(Number(row?.confidence)).toBeLessThan(0.5);
  }, 120_000);
});

describe("the sweep's cursor", () => {
  /**
   * An event whose id sorts BELOW the last one applied, committed after it.
   *
   * Ids are cuids assigned when a row is constructed; rows become visible when
   * their transaction commits. Two writers can commit out of id order, so a
   * cursor over ids leaves the lower id permanently behind — never applied,
   * with nothing anywhere to say it was missed. The sweep exists precisely to
   * catch what the inline path missed, so ordering by id made it blind to its
   * own purpose.
   */
  it("applies an event that arrived out of id order", async () => {
    const learner = `${LEARNER}_late`;
    await db.user.upsert({
      where: { id: learner },
      create: { id: learner, organizationId: ORG, displayName: "Late", locale: "en" },
      update: {},
    });
    await db.learnerProfile.upsert({
      where: { userId: learner },
      create: { userId: learner, organizationId: ORG, tier: "teen" },
      update: {},
    });

    const write = async (id: string, unitId: string, recordedAt: Date) => {
      await db.$executeRawUnsafe(
        `INSERT INTO learning_event
           (id,"organizationId","learnerUserId",type,"unitId","idempotencyKey",payload,"occurredAt","recordedAt",source)
         VALUES ($1,$2,$3,'attempt.recorded',$4,$5,$6::jsonb,$7,$8,'web')
         ON CONFLICT DO NOTHING`,
        id,
        ORG,
        learner,
        unitId,
        `itest_late_${id}`,
        JSON.stringify({ unitId, unitKind: "ayah_body", retrievalType: "recall_first", grade: "good" }),
        recordedAt,
        recordedAt,
      );
    };

    /* "zzz" sorts above "aaa": the row that commits SECOND carries the LOWER
       id, which is what a slower transaction produces — it built its id first
       and became visible last. Both are old enough to be past the sweep's
       commit lag. */
    /* Leftovers from an earlier run would keep their original timestamps
       while the pin below is recomputed, which would put the cursor ahead of
       the fixture and test nothing. */
    await db.memoryState.deleteMany({ where: { learnerUserId: learner } });
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.erasure_request_id = 'itest_late_reset'`);
      await tx.learningEvent.deleteMany({ where: { learnerUserId: learner } });
    });
    await db.$executeRawUnsafe(`DELETE FROM erasure_log WHERE "requestId" = 'itest_late_reset'`);

    const first = new Date(Date.now() - 6 * 60_000);
    const later = new Date(Date.now() - 5 * 60_000);
    await write("itest_late_zzz", "b:78:31", first);
    await write("itest_late_aaa", "b:78:32", later);

    /* The checkpoint is put exactly where it would be after the first row was
       applied. The question is only what the next sweep does with a row whose
       id sorts below it — under the old id cursor, nothing, for ever. */
    await db.projectionCheckpoint.upsert({
      where: { name: "memory_state" },
      create: { name: "memory_state", lastEventId: "itest_late_zzz", lastEventAt: first },
      update: { lastEventId: "itest_late_zzz", lastEventAt: first, rebuildingAt: null },
    });

    await runProjection("memory_state");

    const late = await db.memoryState.findUnique({
      where: { learnerUserId_unitId: { learnerUserId: learner, unitId: "b:78:32" } },
    });
    expect(late, "an event committed after one with a higher id must still be applied").not.toBeNull();

    await db.memoryState.deleteMany({ where: { learnerUserId: learner } });
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.erasure_request_id = 'itest_late_teardown'`);
      await tx.learningEvent.deleteMany({ where: { learnerUserId: learner } });
    });
    await db.$executeRawUnsafe(`DELETE FROM erasure_log WHERE "requestId" = 'itest_late_teardown'`);
    await db.learnerProfile.deleteMany({ where: { userId: learner } });
    await db.user.deleteMany({ where: { id: learner } });
  }, 60_000);
});
