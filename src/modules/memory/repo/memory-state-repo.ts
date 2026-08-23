import type { TenantClient } from "../../platform/db/tenant";
import { withTenant } from "../../platform/db/tenant";
import { emptyState, type MemoryState, type UnitId, type UnitKind } from "../domain";

/**
 * Reading and writing memory state.
 *
 * MemoryState is a PROJECTION. Nothing here is authoritative: every row can be
 * dropped and rebuilt from the event stream, and that is the point — it lets
 * the scheduler change without a migration and without lying about history.
 *
 * A unit with no row is not a unit at zero. It is a unit with nothing recorded,
 * and `emptyState` says so (confidence 0, reps 0).
 */
export type StoredState = MemoryState & { readonly dueAt: Date | null; readonly verifiedAt: Date | null };

function toDomain(row: {
  unitId: string;
  unitKind: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewAt: Date | null;
  lastRetrievalType: string | null;
  confidence: number;
  dueAt: Date | null;
  verifiedAt: Date | null;
}): StoredState {
  return {
    unitId: row.unitId as UnitId,
    kind: row.unitKind as UnitKind,
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    lastReviewAt: row.lastReviewAt,
    lastRetrievalType: row.lastRetrievalType as MemoryState["lastRetrievalType"],
    confidence: row.confidence,
    dueAt: row.dueAt,
    verifiedAt: row.verifiedAt,
  };
}

export async function getState(
  organizationId: string,
  learnerUserId: string,
  unitId: UnitId,
  kind: UnitKind,
  tx?: TenantClient,
): Promise<StoredState> {
  const read = async (client: TenantClient): Promise<StoredState> => {
    const row = await client.memoryState.findUnique({
      where: { learnerUserId_unitId: { learnerUserId, unitId } },
    });
    return row ? toDomain(row) : { ...emptyState(unitId, kind), dueAt: null, verifiedAt: null };
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

export async function getStates(
  organizationId: string,
  learnerUserId: string,
  unitIds: readonly UnitId[],
  tx?: TenantClient,
): Promise<ReadonlyMap<UnitId, StoredState>> {
  const read = async (client: TenantClient) => {
    const rows = await client.memoryState.findMany({
      where: { learnerUserId, unitId: { in: [...unitIds] } },
    });
    return new Map(rows.map((row) => [row.unitId as UnitId, toDomain(row)]));
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

/** Everything due on or before `at`, weakest first — the review queue. */
export async function getDue(
  organizationId: string,
  learnerUserId: string,
  at: Date,
  limit = 200,
): Promise<readonly StoredState[]> {
  return withTenant(organizationId, async (tx) => {
    const rows = await tx.memoryState.findMany({
      where: { learnerUserId, dueAt: { not: null, lte: at } },
      orderBy: { dueAt: "asc" },
      take: limit,
    });
    return rows.map(toDomain);
  });
}

/**
 * Write a projected state. Called only by the projection runner and the
 * attempt path — never by anything a client can reach directly.
 */
export async function upsertState(
  organizationId: string,
  learnerUserId: string,
  state: MemoryState,
  dueAt: Date | null,
  tx: TenantClient,
  verifiedAt?: Date,
): Promise<void> {
  const data = {
    unitKind: state.kind,
    stability: state.stability,
    difficulty: state.difficulty,
    reps: state.reps,
    lapses: state.lapses,
    lastReviewAt: state.lastReviewAt,
    lastRetrievalType: state.lastRetrievalType,
    confidence: state.confidence,
    dueAt,
    ...(verifiedAt ? { verifiedAt } : {}),
  };
  await tx.memoryState.upsert({
    where: { learnerUserId_unitId: { learnerUserId, unitId: state.unitId } },
    create: { organizationId, learnerUserId, unitId: state.unitId, ...data },
    update: data,
  });
}

/** How many words a learner currently holds — the trend a family understands. */
export async function countHeldUnits(
  organizationId: string,
  learnerUserId: string,
  minimumStabilityDays = 7,
): Promise<{ held: number; total: number }> {
  return withTenant(organizationId, async (tx) => {
    const [held, total] = await Promise.all([
      tx.memoryState.count({
        where: { learnerUserId, stability: { gte: minimumStabilityDays }, verifiedAt: { not: null } },
      }),
      tx.memoryState.count({ where: { learnerUserId } }),
    ]);
    return { held, total };
  });
}
