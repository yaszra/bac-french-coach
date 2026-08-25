import { withTenant } from "../../platform/db/tenant";
import type { CorrectionCategory } from "../domain/taxonomy";

/**
 * Reading the verification queue and the verdicts already recorded.
 *
 * Verdicts are immutable rows, so everything here is a plain read. There is no
 * "current verdict" concept and no upsert: a passage heard three times has
 * three verdicts, and the history of what a teacher actually said is the point.
 */

export type PendingVerification = {
  readonly id: string;
  readonly learnerUserId: string;
  readonly learnerName: string;
  readonly track: string;
  readonly requestedAt: Date;
  /** References only: {sura, ayahFrom, ayahTo} or {lessonId}. Never Arabic. */
  readonly unitScope: unknown;
  readonly hasAudio: boolean;
  /** Whole hours this person has been waiting, as of the read. */
  readonly waitingHours: number;
};

/** How long someone has waited. Computed at the read, so no render needs a clock. */
function waitingHoursSince(requestedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - requestedAt.getTime()) / 3_600_000));
}

export async function pendingVerifications(
  organizationId: string,
  learnerUserIds: readonly string[],
  limit = 50,
  now: Date = new Date(),
): Promise<readonly PendingVerification[]> {
  if (learnerUserIds.length === 0) return [];
  return withTenant(organizationId, async (tx) => {
    const rows = await tx.verificationRequest.findMany({
      where: { learnerUserId: { in: [...learnerUserIds] }, state: "pending" },
      // Oldest first: the person who has waited longest is heard first.
      orderBy: { requestedAt: "asc" },
      take: limit,
      select: {
        id: true,
        learnerUserId: true,
        track: true,
        requestedAt: true,
        unitScope: true,
        audioAssetId: true,
      },
    });
    if (rows.length === 0) return [];

    const users = await tx.user.findMany({
      where: { id: { in: rows.map((row) => row.learnerUserId) } },
      select: { id: true, displayName: true },
    });
    const names = new Map(users.map((user) => [user.id, user.displayName]));

    return rows.map((row) => ({
      id: row.id,
      learnerUserId: row.learnerUserId,
      learnerName: names.get(row.learnerUserId) ?? row.learnerUserId,
      track: row.track,
      requestedAt: row.requestedAt,
      unitScope: row.unitScope,
      hasAudio: row.audioAssetId !== null,
      waitingHours: waitingHoursSince(row.requestedAt, now),
    }));
  });
}

export async function pendingVerification(
  organizationId: string,
  requestId: string,
  now: Date = new Date(),
): Promise<PendingVerification | null> {
  return withTenant(organizationId, async (tx) => {
    const row = await tx.verificationRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        learnerUserId: true,
        track: true,
        requestedAt: true,
        unitScope: true,
        audioAssetId: true,
        state: true,
      },
    });
    if (!row || row.state !== "pending") return null;
    const user = await tx.user.findUnique({
      where: { id: row.learnerUserId },
      select: { displayName: true },
    });
    return {
      id: row.id,
      learnerUserId: row.learnerUserId,
      learnerName: user?.displayName ?? row.learnerUserId,
      track: row.track,
      requestedAt: row.requestedAt,
      unitScope: row.unitScope,
      hasAudio: row.audioAssetId !== null,
      waitingHours: waitingHoursSince(row.requestedAt, now),
    };
  });
}

export type RecordedVerdict = {
  readonly id: string;
  readonly verdict: "passed" | "needs_work" | "not_attempted";
  readonly corrections: readonly {
    readonly category: CorrectionCategory;
    readonly sura: number;
    readonly ayah: number;
    readonly wordIndex?: number;
  }[];
  readonly note: string | null;
  readonly decidedAt: Date;
  readonly decidedByName: string;
  /**
   * The passage the verdict was about, when the request recorded one.
   *
   * A teacher looking at a student wants to see the page they were last heard
   * on, and that is knowable only from the request — so it travels with the
   * verdict rather than being guessed downstream.
   */
  readonly scope: { readonly sura: number; readonly ayahFrom: number; readonly ayahTo: number } | null;
  /** How the evidence was obtained, when the request recorded it. */
  readonly evidenceKind: string | null;
};

/**
 * Corrections come back out of a JSON column, so they are re-read rather than
 * trusted: a row written by an older shape of the taxonomy must not crash a
 * teacher's history page. Anything unreadable is dropped, never guessed at.
 */
function correctionsOf(value: unknown): RecordedVerdict["corrections"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    if (
      typeof record.category !== "string" ||
      typeof record.sura !== "number" ||
      typeof record.ayah !== "number"
    ) {
      return [];
    }
    return [
      {
        category: record.category as CorrectionCategory,
        sura: record.sura,
        ayah: record.ayah,
        ...(typeof record.wordIndex === "number" ? { wordIndex: record.wordIndex } : {}),
      },
    ];
  });
}

function scopeRangeOf(unitScope: unknown): RecordedVerdict["scope"] {
  if (unitScope === null || typeof unitScope !== "object" || Array.isArray(unitScope)) return null;
  const record = unitScope as Record<string, unknown>;
  const { sura, ayahFrom, ayahTo } = record;
  if (typeof sura !== "number" || typeof ayahFrom !== "number" || typeof ayahTo !== "number") {
    return null;
  }
  if (ayahTo < ayahFrom) return null;
  return { sura, ayahFrom, ayahTo };
}

function evidenceKindOf(unitScope: unknown): string | null {
  if (unitScope !== null && typeof unitScope === "object" && !Array.isArray(unitScope)) {
    const kind = (unitScope as Record<string, unknown>).evidenceKind;
    if (typeof kind === "string") return kind;
  }
  return null;
}

export async function verdictHistory(
  organizationId: string,
  learnerUserId: string,
  limit = 25,
): Promise<readonly RecordedVerdict[]> {
  return withTenant(organizationId, async (tx) => {
    const rows = await tx.verdict.findMany({
      where: { request: { learnerUserId } },
      orderBy: { decidedAt: "desc" },
      take: limit,
      select: {
        id: true,
        verdict: true,
        corrections: true,
        note: true,
        decidedAt: true,
        decidedByUserId: true,
        request: { select: { unitScope: true } },
      },
    });
    if (rows.length === 0) return [];

    const deciders = await tx.user.findMany({
      where: { id: { in: rows.map((row) => row.decidedByUserId) } },
      select: { id: true, displayName: true },
    });
    const names = new Map(deciders.map((user) => [user.id, user.displayName]));

    return rows.map((row) => ({
      id: row.id,
      verdict: row.verdict as RecordedVerdict["verdict"],
      corrections: correctionsOf(row.corrections),
      note: row.note,
      decidedAt: row.decidedAt,
      decidedByName: names.get(row.decidedByUserId) ?? row.decidedByUserId,
      scope: scopeRangeOf(row.request.unitScope),
      evidenceKind: evidenceKindOf(row.request.unitScope),
    }));
  });
}

export type KhatmaFlagRow = {
  readonly id: string;
  readonly learnerUserId: string;
  readonly position: { readonly sura: number; readonly ayah: number; readonly wordIndex?: number };
  readonly category: string;
  readonly note: string | null;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
};

function positionOf(value: unknown): KhatmaFlagRow["position"] | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.sura !== "number" || typeof record.ayah !== "number") return null;
  return {
    sura: record.sura,
    ayah: record.ayah,
    ...(typeof record.wordIndex === "number" ? { wordIndex: record.wordIndex } : {}),
  };
}

/** Flags across sessions. Unresolved first — they are the reason to be here. */
export async function khatmaFlags(
  organizationId: string,
  learnerUserIds: readonly string[],
  limit = 100,
): Promise<readonly KhatmaFlagRow[]> {
  if (learnerUserIds.length === 0) return [];
  return withTenant(organizationId, async (tx) => {
    const rows = await tx.khatmaFlag.findMany({
      where: { learnerUserId: { in: [...learnerUserIds] } },
      orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        learnerUserId: true,
        position: true,
        category: true,
        note: true,
        createdAt: true,
        resolvedAt: true,
      },
    });
    return rows.flatMap((row) => {
      const position = positionOf(row.position);
      // A flag whose position we cannot read is dropped rather than rendered
      // at a guessed location: a pin in the wrong place is worse than none.
      if (position === null) return [];
      return [
        {
          id: row.id,
          learnerUserId: row.learnerUserId,
          position,
          category: row.category,
          note: row.note,
          createdAt: row.createdAt,
          resolvedAt: row.resolvedAt,
        },
      ];
    });
  });
}
