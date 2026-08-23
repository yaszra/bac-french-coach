import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { gradeAttempt, reviewEvidenceOf } from "../../src/modules/hifz/domain/grading";
import { applyVerdict } from "../../src/modules/assessment/domain/verdict";
import { memoryProjection } from "../../src/modules/memory/repo/memory-projection";
import type { ProjectionEvent } from "../../src/modules/platform/events/projection";

/**
 * The whole chain, end to end, against a real database:
 *
 *   observation → server grade → append-only event → projection → memory state
 *
 * Each of these pieces has its own unit tests. This one exists to prove they
 * are actually joined up, and — more importantly — that the joins preserve the
 * two rules the product rests on: a client never decides what an attempt was
 * worth, and nothing but a human verdict marks a unit verified.
 */
const db = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_DATABASE_URL ?? "postgresql://itqan:itqan@localhost:5432/itqan" },
  },
});

const ORG = "itest_chain_org";
const LEARNER = "itest_chain_learner";
const TEACHER = "itest_chain_teacher";
const UNIT = "b:78:1";

beforeAll(async () => {
  await db.organization.upsert({
    where: { id: ORG },
    create: { id: ORG, name: "Chain test", slug: "itest-chain", region: "eu", locale: "en" },
    update: {},
  });
  for (const [id, name] of [[LEARNER, "Learner"], [TEACHER, "Teacher"]] as const) {
    await db.user.upsert({
      where: { id },
      create: { id, organizationId: ORG, displayName: name, locale: "en" },
      update: {},
    });
  }
  await db.learnerProfile.upsert({
    where: { userId: LEARNER },
    create: { userId: LEARNER, organizationId: ORG, tier: "teen" },
    update: {},
  });
}, 60_000);

afterAll(async () => {
  await db.memoryState.deleteMany({ where: { organizationId: ORG } });
  await db.attempt.deleteMany({ where: { organizationId: ORG } });
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.erasure_request_id = 'itest_chain_teardown'`);
    await tx.learningEvent.deleteMany({ where: { organizationId: ORG } });
  });
  await db.$executeRawUnsafe(`DELETE FROM erasure_log WHERE "requestId" = 'itest_chain_teardown'`);
  await db.learnerProfile.deleteMany({ where: { organizationId: ORG } });
  await db.user.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.$disconnect();
});

beforeEach(async () => {
  await db.memoryState.deleteMany({ where: { organizationId: ORG } });
});

/** The path a real submission takes, minus the HTTP layer. */
async function submitObservation(
  evidence: Parameters<typeof gradeAttempt>[0],
  occurredAt: Date,
  idempotencyKey: string,
): Promise<{ graded: boolean; grade?: string }> {
  const result = gradeAttempt(evidence, {});
  if (result.kind !== "graded") return { graded: false };

  const review = reviewEvidenceOf(evidence.exercise, result, occurredAt);
  if (!review) return { graded: false };

  const event = {
    organizationId: ORG,
    learnerUserId: LEARNER,
    type: "attempt.recorded",
    unitId: UNIT,
    idempotencyKey,
    payload: {
      unitId: UNIT,
      unitKind: "ayah_body",
      retrievalType: review.retrievalType,
      grade: review.grade,
    },
    occurredAt,
    source: "web",
  };
  await db.learningEvent.create({ data: event });

  const stored = await db.learningEvent.findFirst({
    where: { organizationId: ORG, idempotencyKey },
  });
  await memoryProjection.apply(
    {
      id: stored!.id,
      organizationId: ORG,
      learnerUserId: LEARNER,
      type: "attempt.recorded",
      unitId: UNIT,
      payload: stored!.payload,
      occurredAt: stored!.occurredAt,
      recordedAt: stored!.recordedAt,
    } satisfies ProjectionEvent,
    { db } as never,
  );
  return { graded: true, grade: review.grade };
}

describe("observation → grade → event → memory state", () => {
  it("turns a clean rebuild into memory state with a due date", async () => {
    const at = new Date("2026-08-23T18:00:00Z");
    const outcome = await submitObservation(
      {
        exercise: "rebuild",
        placements: Array.from({ length: 6 }, (_, index) => ({ index, correct: true })),
        rescrambles: 0,
        elapsedMs: 9_000,
      },
      at,
      "itest_chain_clean",
    );
    expect(outcome.graded).toBe(true);

    const state = await db.memoryState.findUnique({
      where: { learnerUserId_unitId: { learnerUserId: LEARNER, unitId: UNIT } },
    });
    expect(state).not.toBeNull();
    expect(state!.reps).toBe(1);
    expect(state!.dueAt).not.toBeNull();
    expect(state!.dueAt!.getTime()).toBeGreaterThan(at.getTime());
    // Practising alone never verifies. Only an ear does.
    expect(state!.verifiedAt).toBeNull();
  }, 60_000);

  it("gives a rebuild less credit than the learner might hope, and records why", async () => {
    const at = new Date("2026-08-23T18:00:00Z");
    // Every word was on screen, and it took many rescrambles to place them.
    const laboured = await submitObservation(
      {
        exercise: "rebuild",
        placements: Array.from({ length: 6 }, (_, index) => ({ index, correct: index < 4 })),
        rescrambles: 12,
        elapsedMs: 60_000,
      },
      at,
      "itest_chain_laboured",
    );
    expect(laboured.grade).toBe("again");
  }, 60_000);

  it("refuses to grade a recitation by machine, however complete the observation", async () => {
    const result = gradeAttempt(
      {
        exercise: "oral_recitation",
        durationMs: 30_000,
        completedWithoutPrompt: true,
      } as never,
      {},
    );
    expect(result.kind).toBe("requires_human");

    // And nothing reached the database as a result.
    const events = await db.learningEvent.count({ where: { organizationId: ORG, type: "verdict.given" } });
    expect(events).toBe(0);
  }, 60_000);

  it("marks a unit verified only when a teacher says so", async () => {
    const practisedAt = new Date("2026-08-23T18:00:00Z");
    await submitObservation(
      {
        exercise: "rebuild",
        placements: Array.from({ length: 6 }, (_, index) => ({ index, correct: true })),
        rescrambles: 0,
        elapsedMs: 9_000,
      },
      practisedAt,
      "itest_chain_before_verdict",
    );

    const before = await db.memoryState.findUnique({
      where: { learnerUserId_unitId: { learnerUserId: LEARNER, unitId: UNIT } },
    });
    expect(before!.verifiedAt).toBeNull();

    const decidedAt = new Date("2026-08-24T09:00:00Z");
    const consequences = applyVerdict({
      kind: "passed",
      unitIds: [UNIT],
      corrections: [{ category: "hesitation", sura: 78, ayah: 1 }],
      decidedByUserId: TEACHER,
      decidedAt,
    });
    expect(consequences.units[0]?.verified).toBe(true);

    const verdictEvent = await db.learningEvent.create({
      data: {
        organizationId: ORG,
        learnerUserId: LEARNER,
        type: "verdict.given",
        idempotencyKey: "itest_chain_verdict",
        payload: { verdict: "passed", unitIds: [UNIT], corrections: [], decidedByUserId: TEACHER },
        occurredAt: decidedAt,
        source: "teacher_console",
      },
    });
    await memoryProjection.apply(
      {
        id: verdictEvent.id,
        organizationId: ORG,
        learnerUserId: LEARNER,
        type: "verdict.given",
        unitId: null,
        payload: verdictEvent.payload,
        occurredAt: decidedAt,
        recordedAt: verdictEvent.recordedAt,
      } satisfies ProjectionEvent,
      { db } as never,
    );

    const after = await db.memoryState.findUnique({
      where: { learnerUserId_unitId: { learnerUserId: LEARNER, unitId: UNIT } },
    });
    expect(after!.verifiedAt).not.toBeNull();
    expect(after!.verifiedAt!.toISOString()).toBe(decidedAt.toISOString());
  }, 60_000);

  it("counts a replayed offline attempt once", async () => {
    const at = new Date("2026-08-23T18:00:00Z");
    const evidence = {
      exercise: "rebuild" as const,
      placements: Array.from({ length: 6 }, (_, index) => ({ index, correct: true })),
      rescrambles: 0,
      elapsedMs: 9_000,
    };
    await submitObservation(evidence, at, "itest_chain_replay");
    await expect(submitObservation(evidence, at, "itest_chain_replay")).rejects.toThrow(/unique|duplicate/i);

    const state = await db.memoryState.findUnique({
      where: { learnerUserId_unitId: { learnerUserId: LEARNER, unitId: UNIT } },
    });
    // One attempt, one repetition — the phone syncing twice changed nothing.
    expect(state!.reps).toBe(1);
  }, 60_000);

  it("leaves a learner with nothing recorded rather than a zero", async () => {
    const state = await db.memoryState.findUnique({
      where: { learnerUserId_unitId: { learnerUserId: LEARNER, unitId: "b:99:9" } },
    });
    // No row is not "0% mastery". It is an absence, and the loader says so.
    expect(state).toBeNull();
  }, 60_000);
});
