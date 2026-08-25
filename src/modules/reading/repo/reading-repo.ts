/**
 * Reading state, read back out of the event log.
 *
 * Everything a learner knows about the Qāʿidah is a consequence of recorded evidence,
 * so this module reads the append-only `LearningEvent` stream — the source of truth —
 * and hands the pure engines the observations they need. It computes nothing about
 * mastery itself: SmartScore, the ladder and the lesson plan do that, and they are
 * tested without a database.
 *
 * Every read is tenant-scoped through `withTenant`, so row-level security applies.
 */

import { withTenant, type TenantClient } from "../../platform/db/tenant";
import { conceptIdToUnitId, type ConceptId } from "../domain/concepts";
import type { ConceptObservation } from "../domain/evidence";
import { smartScore } from "../domain/smartscore";
import { ladderState } from "../domain/masteryLadder";
import { isUnlocked } from "../domain/concepts";
import type { ConceptPlanState } from "../domain/lessonPlan";
import { observationsFromRows, type StoredAttemptRow } from "../ui/evidence-shape";

const CONCEPT_UNIT_PREFIX = "c:";

/** Bounded: a learner who has practised for years still has a finite path. */
const MAX_EVENTS = 5_000;

function conceptIdOfUnit(unitId: string): ConceptId | null {
  if (!unitId.startsWith(CONCEPT_UNIT_PREFIX)) return null;
  const conceptId = unitId.slice(CONCEPT_UNIT_PREFIX.length);
  return conceptId.length === 0 ? null : conceptId;
}

interface EventRow {
  readonly unitId: string | null;
  readonly payload: unknown;
  readonly occurredAt: Date;
}

/** Read the payload defensively: it is JSON, and old events outlive new code. */
function toAttemptRow(row: EventRow): StoredAttemptRow | null {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const unitId = typeof payload.unitId === "string" ? payload.unitId : (row.unitId ?? "");
  const conceptId = conceptIdOfUnit(unitId);
  if (conceptId === null) return null;
  if (typeof payload.retrievalType !== "string" || typeof payload.grade !== "string") return null;

  const durationMs = typeof payload.durationMs === "number" ? payload.durationMs : undefined;
  return {
    conceptId,
    retrievalType: payload.retrievalType,
    grade: payload.grade,
    occurredAt: row.occurredAt,
    ...(durationMs === undefined ? {} : { durationMs }),
  };
}

export async function readingAttemptRows(
  organizationId: string,
  learnerUserId: string,
  tx?: TenantClient,
): Promise<readonly StoredAttemptRow[]> {
  const read = async (client: TenantClient): Promise<readonly StoredAttemptRow[]> => {
    const rows = await client.learningEvent.findMany({
      where: {
        learnerUserId,
        type: "attempt.recorded",
        unitId: { startsWith: CONCEPT_UNIT_PREFIX },
      },
      orderBy: { occurredAt: "asc" },
      take: MAX_EVENTS,
      select: { unitId: true, payload: true, occurredAt: true },
    });
    return rows.flatMap((row) => {
      const attempt = toAttemptRow(row as EventRow);
      return attempt === null ? [] : [attempt];
    });
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

/** Whether a human who can hear this learner is attached to them. */
export async function hasTeacher(
  organizationId: string,
  learnerUserId: string,
  tx?: TenantClient,
): Promise<boolean> {
  const read = async (client: TenantClient): Promise<boolean> => {
    const count = await client.relationship.count({
      where: { learnerUserId, kind: "teacher_student", state: "approved" },
    });
    return count > 0;
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

/** Explicit due dates from the scheduler, for the reading concepts asked about. */
export async function conceptDueDates(
  organizationId: string,
  learnerUserId: string,
  conceptIds: readonly ConceptId[],
  tx?: TenantClient,
): Promise<ReadonlyMap<ConceptId, Date>> {
  const unitIds = conceptIds.map(conceptIdToUnitId);
  const read = async (client: TenantClient): Promise<ReadonlyMap<ConceptId, Date>> => {
    const rows = await client.memoryState.findMany({
      where: { learnerUserId, unitId: { in: unitIds } },
      select: { unitId: true, dueAt: true },
    });
    const due = new Map<ConceptId, Date>();
    for (const row of rows) {
      const conceptId = conceptIdOfUnit(row.unitId);
      if (conceptId !== null && row.dueAt !== null) due.set(conceptId, row.dueAt);
    }
    return due;
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}

export interface ReadingSnapshot {
  readonly now: Date;
  readonly hasTeacher: boolean;
  readonly observations: readonly ConceptObservation[];
  readonly dueAt: ReadonlyMap<ConceptId, Date>;
}

/** One round trip's worth of a learner's reading history. */
export async function readingSnapshot(
  organizationId: string,
  learnerUserId: string,
  conceptIds: readonly ConceptId[],
  now: Date = new Date(),
): Promise<ReadingSnapshot> {
  return withTenant(organizationId, async (tx) => {
    const [rows, teacher, dueAt] = await Promise.all([
      readingAttemptRows(organizationId, learnerUserId, tx),
      hasTeacher(organizationId, learnerUserId, tx),
      conceptDueDates(organizationId, learnerUserId, conceptIds, tx),
    ]);
    return {
      now,
      hasTeacher: teacher,
      observations: observationsFromRows(rows, { hasTeacher: teacher }),
      dueAt,
    };
  });
}

/**
 * The per-concept state the planner and the overview both read.
 *
 * Pure given a snapshot — the database has already been left behind — so the whole
 * shape of a learner's path can be exercised in a unit test.
 */
export function conceptStatesFrom(
  conceptIds: readonly ConceptId[],
  snapshot: ReadingSnapshot,
): readonly ConceptPlanState[] {
  const secure = new Set<ConceptId>();
  const states = conceptIds.map((conceptId): ConceptPlanState => {
    const score = smartScore(conceptId, snapshot.observations, { now: snapshot.now });
    if (score.state === "secure") secure.add(conceptId);
    return {
      conceptId,
      smartScore: score,
      ladder: ladderState(conceptId, snapshot.observations, {
        hasTeacher: snapshot.hasTeacher,
      }),
      unlocked: isUnlocked(conceptId, secure),
      ...(snapshot.dueAt.has(conceptId)
        ? { dueAt: snapshot.dueAt.get(conceptId) as Date }
        : {}),
    };
  });
  return states;
}
