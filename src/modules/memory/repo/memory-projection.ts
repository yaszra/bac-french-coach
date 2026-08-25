import { registerProjection, type ProjectionEvent } from "../../platform/events/projection";
import {
  applyReview,
  emptyState,
  DEFAULT_SCHEDULING_POLICY,
  type Grade,
  type MemoryState,
  type RetrievalType,
  type UnitId,
  type UnitKind,
} from "../domain";

/**
 * The memory projection: LearningEvent → MemoryState.
 *
 * This is the only writer of memory state, and it derives everything from
 * events that already happened. Two consequences worth stating plainly:
 *
 *   · Rebuilding is safe. Drop every row, replay the stream, and the result is
 *     identical — which is what makes changing the scheduler possible at all.
 *   · A client cannot reach it. Grades arrive already server-validated, on
 *     events; there is no path from a request body to this function.
 */
type MaintenanceClient = {
  memoryState: {
    findUnique(args: unknown): Promise<Record<string, unknown> | null>;
    upsert(args: unknown): Promise<unknown>;
    deleteMany(args?: unknown): Promise<unknown>;
  };
};

function rowToState(row: Record<string, unknown> | null, unitId: UnitId, kind: UnitKind): MemoryState {
  if (!row) return emptyState(unitId, kind);
  return {
    unitId,
    kind,
    stability: Number(row.stability),
    difficulty: Number(row.difficulty),
    reps: Number(row.reps),
    lapses: Number(row.lapses),
    lastReviewAt: (row.lastReviewAt as Date | null) ?? null,
    lastRetrievalType: (row.lastRetrievalType as RetrievalType | null) ?? null,
    confidence: Number(row.confidence),
  };
}

/**
 * Fold one event into memory state, using whichever client the caller has.
 *
 * This is called from TWO places, deliberately:
 *
 *   · inline, in the same transaction that appends the event, with the
 *     request's tenant-scoped client — so a learner who answers correctly sees
 *     the unit stop being due, immediately, in the same unit of work. Without
 *     this the scheduler is frozen: events accumulate and nothing moves.
 *   · from the projection runner, with the maintenance client, as the catch-up
 *     and rebuild path for anything the inline call missed.
 *
 * Both paths run the same fold, so the two can never disagree.
 */
export async function foldEventIntoMemoryState(
  event: ProjectionEvent,
  client: MaintenanceClient,
): Promise<void> {
  const payload = event.payload as Record<string, unknown>;

  if (event.type === "attempt.recorded") {
    const unitId = (payload.unitId ?? event.unitId) as UnitId | undefined;
    if (!unitId) return;
    await applyOne(
      client,
      event,
      unitId,
      payload.unitKind as UnitKind,
      payload.grade as Grade,
      payload.retrievalType as RetrievalType,
    );
    return;
  }

  if (event.type === "verdict.given") {
    // A human's verdict is evidence like any other — stronger evidence, and
    // the only kind that can mark a unit verified.
    const unitIds = (payload.unitIds ?? []) as UnitId[];
    const verdict = String(payload.verdict);
    const grade: Grade = verdict === "passed" ? "good" : "again";
    for (const unitId of unitIds) {
      await applyOne(client, event, unitId, undefined, grade, "oral_recitation", verdict === "passed");
    }
  }
}

export const memoryProjection = {
  name: "memory_state",
  handles: ["attempt.recorded", "verdict.given"],

  async apply(event: ProjectionEvent, ctx: { db: unknown }): Promise<void> {
    await foldEventIntoMemoryState(event, ctx.db as MaintenanceClient);
  },

  async reset(ctx: { db: unknown }): Promise<void> {
    // Safe precisely because this table is derived, never authoritative.
    await (ctx.db as MaintenanceClient).memoryState.deleteMany({});
  },
};

async function applyOne(
  db: MaintenanceClient,
  event: ProjectionEvent,
  unitId: UnitId,
  unitKind: UnitKind | undefined,
  grade: Grade,
  retrievalType: RetrievalType,
  verified = false,
): Promise<void> {
  const kind: UnitKind = unitKind ?? inferKind(unitId);
  const row = await db.memoryState.findUnique({
    where: { learnerUserId_unitId: { learnerUserId: event.learnerUserId, unitId } },
  });
  const current = rowToState(row, unitId, kind);

  const outcome = applyReview(
    current,
    { grade, retrievalType, at: event.occurredAt },
    DEFAULT_SCHEDULING_POLICY,
  );

  const data = {
    unitKind: kind,
    stability: outcome.next.stability,
    difficulty: outcome.next.difficulty,
    reps: outcome.next.reps,
    lapses: outcome.next.lapses,
    lastReviewAt: outcome.next.lastReviewAt,
    lastRetrievalType: outcome.next.lastRetrievalType,
    confidence: outcome.next.confidence,
    dueAt: outcome.dueAt,
    ...(verified ? { verifiedAt: event.occurredAt } : {}),
  };

  await db.memoryState.upsert({
    where: { learnerUserId_unitId: { learnerUserId: event.learnerUserId, unitId } },
    create: { organizationId: event.organizationId, learnerUserId: event.learnerUserId, unitId, ...data },
    update: data,
  });
}

function inferKind(unitId: UnitId): UnitKind {
  if (unitId.startsWith("t:")) return "ayah_transition";
  if (unitId.startsWith("p:")) return "page_position";
  if (unitId.startsWith("c:")) return "reading_concept";
  return "ayah_body";
}

registerProjection(memoryProjection);
