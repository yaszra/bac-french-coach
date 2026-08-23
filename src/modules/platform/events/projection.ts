import { withoutTenantForMaintenance } from "../db/tenant";
import { logger } from "../observability/logger";

/**
 * The projection runner.
 *
 * A projection is a named, resumable fold over the event stream. It keeps a
 * checkpoint so it can stop, resume, and — the point of the whole design — be
 * dropped and rebuilt from scratch when the memory engine changes. Nothing is
 * lost by rebuilding, because nothing derived is the source of truth.
 */
export type ProjectionEvent = {
  readonly id: string;
  readonly organizationId: string;
  readonly learnerUserId: string;
  readonly type: string;
  readonly unitId: string | null;
  readonly payload: unknown;
  readonly occurredAt: Date;
  readonly recordedAt: Date;
};

export type ProjectionHandler = {
  readonly name: string;
  /** Types this projection cares about; others are skipped cheaply. */
  readonly handles: readonly string[];
  apply(event: ProjectionEvent, ctx: ProjectionContext): Promise<void>;
  /** Called before a full rebuild so the projection can clear what it owns. */
  reset?(ctx: ProjectionContext): Promise<void>;
};

export type ProjectionContext = {
  readonly db: Awaited<ReturnType<typeof maintenanceDb>>;
  readonly logger: typeof logger;
};

type MaintenanceDb = Parameters<Parameters<typeof withoutTenantForMaintenance>[1]>[0];
async function maintenanceDb(): Promise<MaintenanceDb> {
  throw new Error("maintenanceDb is a type helper only");
}

const registry = new Map<string, ProjectionHandler>();

export function registerProjection(handler: ProjectionHandler): void {
  registry.set(handler.name, handler);
}

export function registeredProjections(): readonly ProjectionHandler[] {
  return [...registry.values()];
}

export type RunResult = {
  readonly projection: string;
  readonly applied: number;
  readonly lastEventId: string | null;
};

/**
 * Advance one projection to the head of the stream. Runs as the maintenance
 * role because it deliberately crosses tenants; it is never reachable from a
 * request handler.
 */
export async function runProjection(
  name: string,
  options: { readonly batchSize?: number; readonly rebuild?: boolean } = {},
): Promise<RunResult> {
  const handler = registry.get(name);
  if (!handler) throw new Error(`unknown projection: ${name}`);
  const batchSize = options.batchSize ?? 500;

  return withoutTenantForMaintenance(`projection:${name}`, async (db) => {
    const ctx = { db, logger } as unknown as ProjectionContext;

    if (options.rebuild) {
      logger.warn({ projection: name }, "rebuilding projection from the beginning");
      await handler.reset?.(ctx);
      await db.projectionCheckpoint.upsert({
        where: { name },
        create: { name, rebuildingAt: new Date() },
        update: { lastEventId: null, lastEventAt: null, rebuildingAt: new Date() },
      });
    }

    const checkpoint = await db.projectionCheckpoint.findUnique({ where: { name } });
    let cursor = checkpoint?.lastEventId ?? null;
    let applied = 0;

    for (;;) {
      const batch: ProjectionEvent[] = await db.learningEvent.findMany({
        where: { type: { in: [...handler.handles] } },
        orderBy: { id: "asc" },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          organizationId: true,
          learnerUserId: true,
          type: true,
          unitId: true,
          payload: true,
          occurredAt: true,
          recordedAt: true,
        },
      });
      if (batch.length === 0) break;

      for (const event of batch) {
        await handler.apply(event, ctx);
        cursor = event.id;
        applied++;
      }

      const last = batch[batch.length - 1];
      if (last) {
        await db.projectionCheckpoint.upsert({
          where: { name },
          create: { name, lastEventId: last.id, lastEventAt: last.occurredAt },
          update: { lastEventId: last.id, lastEventAt: last.occurredAt, rebuildingAt: null },
        });
      }
      if (batch.length < batchSize) break;
    }

    logger.info({ projection: name, applied }, "projection advanced");
    return { projection: name, applied, lastEventId: cursor };
  });
}

export async function runAllProjections(options?: { readonly rebuild?: boolean }): Promise<readonly RunResult[]> {
  const results: RunResult[] = [];
  for (const handler of registry.values()) {
    results.push(await runProjection(handler.name, options ?? {}));
  }
  return results;
}
