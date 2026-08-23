import { withTenant, type TenantClient } from "../../platform/db/tenant";
import { buildDailyReport, type DailyReport, type ReportEvent } from "../domain/daily-report";
import { localDate } from "../../platform/jobs/handlers/evening";
import { parseUnitId } from "../../memory/domain/types";
import { wordsOf } from "../../content/domain/loader";

/**
 * Reading what actually happened, for one learner on one day.
 *
 * The day is the family's local day, not a UTC one, so a report headed
 * "Saturday" covers the Saturday the child lived. Everything here is a read of
 * recorded evidence: this module writes no memory state and grades nothing.
 */

export type ReportContext = {
  readonly learnerUserId: string;
  readonly timezone: string;
  readonly forDate: string;
};

/** Held units, converted to the number a family understands: words. */
export async function countWordsHeld(
  organizationId: string,
  learnerUserId: string,
  asOf: Date | null,
  tx?: TenantClient,
): Promise<number> {
  const read = async (client: TenantClient): Promise<number> => {
    const rows = await client.memoryState.findMany({
      where: {
        learnerUserId,
        unitKind: "ayah_body",
        verifiedAt: asOf === null ? { not: null } : { not: null, lte: asOf },
        stability: { gte: 7 },
      },
      select: { unitId: true },
    });
    let words = 0;
    for (const row of rows) {
      const parsed = parseUnitId(row.unitId);
      if (parsed?.kind !== "ayah_body") continue;
      words += wordsOf(parsed.ayah.surah, parsed.ayah.ayah).length;
    }
    return words;
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

export async function loadDailyReport(
  organizationId: string,
  ctx: ReportContext,
  now: Date = new Date(),
): Promise<DailyReport> {
  return withTenant(organizationId, async (tx) => {
    // A generous UTC window around the local day, then filtered exactly by the
    // learner's own calendar — no timezone arithmetic invented here.
    const anchor = new Date(`${ctx.forDate}T12:00:00Z`);
    const rows = await tx.learningEvent.findMany({
      where: {
        learnerUserId: ctx.learnerUserId,
        occurredAt: {
          gte: new Date(anchor.getTime() - 36 * 3_600_000),
          lte: new Date(anchor.getTime() + 36 * 3_600_000),
        },
      },
      select: { type: true, unitId: true, occurredAt: true, payload: true },
      orderBy: { occurredAt: "asc" },
    });

    const events: ReportEvent[] = rows
      .filter((row) => localDate(ctx.timezone, row.occurredAt) === ctx.forDate)
      .map((row) => ({
        type: row.type,
        unitId: row.unitId,
        occurredAt: row.occurredAt,
        payload: (row.payload ?? {}) as Record<string, unknown>,
      }));

    const reviewsDue = await tx.memoryState.count({
      where: { learnerUserId: ctx.learnerUserId, dueAt: { not: null, lte: now } },
    });

    const wordsHeld = await countWordsHeld(organizationId, ctx.learnerUserId, null, tx);
    const lastWeek = new Date(anchor.getTime() - 7 * 86_400_000);
    // A comparison exists only if there was evidence a week ago. When the
    // learner has no history that far back, the report says so by carrying null
    // — buildDailyReport will not invent a direction from it.
    const hadHistory = await tx.learningEvent.count({
      where: { learnerUserId: ctx.learnerUserId, occurredAt: { lte: lastWeek } },
    });
    const wordsHeldLastWeek =
      hadHistory > 0 ? await countWordsHeld(organizationId, ctx.learnerUserId, lastWeek, tx) : null;

    return buildDailyReport({
      learnerUserId: ctx.learnerUserId,
      forDate: ctx.forDate,
      events,
      reviewsDue,
      wordsHeld,
      wordsHeldLastWeek,
    });
  });
}

export type ReportRunState = "queued" | "running" | "completed" | "failed";

/**
 * Report runs are idempotent by (kind, scope, date): the same nightly job
 * firing twice writes one row, and a re-run replaces its payload rather than
 * producing a second, disagreeing report.
 */
export async function saveReportRun(input: {
  organizationId: string;
  kind: string;
  scopeType: "organization" | "school" | "classroom" | "learner";
  scopeId: string;
  forDate: Date;
  state: ReportRunState;
  payload?: unknown;
  generatedAt?: Date;
}): Promise<void> {
  await withTenant(input.organizationId, async (tx) => {
    const data = {
      state: input.state,
      ...(input.payload === undefined ? {} : { payload: input.payload as object }),
      generatedAt: input.generatedAt ?? null,
    };
    await tx.reportRun.upsert({
      where: {
        kind_scopeType_scopeId_forDate: {
          kind: input.kind,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          forDate: input.forDate,
        },
      },
      create: {
        organizationId: input.organizationId,
        kind: input.kind,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        forDate: input.forDate,
        ...data,
      },
      update: data,
    });
  });
}

export async function readReportRun(
  organizationId: string,
  kind: string,
  scopeType: "organization" | "school" | "classroom" | "learner",
  scopeId: string,
  forDate: Date,
): Promise<{ state: string; payload: unknown; generatedAt: Date | null } | null> {
  return withTenant(organizationId, async (tx) => {
    const row = await tx.reportRun.findUnique({
      where: { kind_scopeType_scopeId_forDate: { kind, scopeType, scopeId, forDate } },
      select: { state: true, payload: true, generatedAt: true },
    });
    return row ?? null;
  });
}
