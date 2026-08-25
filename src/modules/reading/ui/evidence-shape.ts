/**
 * Turning stored history back into evidence.
 *
 * The reading module writes the same `attempt.recorded` events as ḥifẓ — there is one
 * event vocabulary, and reading does not get a private one. That means a stored row
 * carries four things: which concept, whether it went well, when, and how it was
 * retrieved. A `ConceptObservation` wants three more: which sitting it fell in, how it
 * was presented, and what kind of evidence it is.
 *
 * None of those three is invented here:
 *
 * - **evidence kind** is read off the retrieval type, which already distinguishes a
 *   machine-checked `recognition` from a learner's own `production` and from
 *   `oral_recitation`, the teacher's ear. The mapping is total and one-way.
 * - **presentation** is *replayed*, not guessed. The server always builds an activity
 *   at the rung the learner was working on, so walking the concept's observations in
 *   order and asking the ladder what rung it was on reproduces exactly the rung each
 *   activity was built at. `presentationForActivity` is the single function both the
 *   builder and the replay call, which is what makes them agree by construction.
 * - **sitting** is derived by a gap: consecutive attempts less than
 *   `SESSION_GAP_MINUTES` apart are one sitting. The denominator this produces is a
 *   real count of sittings under a stated rule, and the rule travels with it.
 *
 * Pure module: no I/O, no clock, no randomness.
 */

import type { ConceptId } from "../domain/concepts";
import type {
  ActivityKind,
  ConceptObservation,
  EvidenceKind,
  Presentation,
} from "../domain/evidence";
import { ladderState, type LadderRung } from "../domain/masteryLadder";

/** Retrieval types the reading surface writes. All three already exist in memory. */
export const READING_RETRIEVAL_TYPES = ["recognition", "production", "oral_recitation"] as const;
export type ReadingRetrievalType = (typeof READING_RETRIEVAL_TYPES)[number];

export type ReadingGrade = "again" | "good";

/**
 * A rung and an activity kind decide the presentation.
 *
 * A recognition item is never `in_person` — a machine check is not a person listening
 * — so a learner working on the top rung still practises recognition `randomized`.
 * Saying otherwise would label machine evidence as though a teacher had heard it.
 */
export function presentationForActivity(
  workingOn: LadderRung,
  activityKind: ActivityKind,
): Presentation {
  if (activityKind === "production") return "in_person";
  return workingOn === "in_person" ? "randomized" : workingOn;
}

/** Which retrieval type a piece of reading evidence is stored as. */
export function retrievalTypeFor(
  activityKind: ActivityKind,
  evidenceKind: EvidenceKind,
): ReadingRetrievalType {
  if (activityKind === "recognition") return "recognition";
  return evidenceKind === "teacher_observed" ? "oral_recitation" : "production";
}

/** And back again. Unknown retrieval types are not reading evidence. */
export function evidenceKindOfRetrieval(retrievalType: string): EvidenceKind | null {
  if (retrievalType === "recognition") return "machine_checked";
  if (retrievalType === "oral_recitation") return "teacher_observed";
  if (retrievalType === "production") return "self_confirmed";
  return null;
}

export function activityKindOfRetrieval(retrievalType: string): ActivityKind | null {
  if (retrievalType === "recognition") return "recognition";
  if (retrievalType === "production" || retrievalType === "oral_recitation") return "production";
  return null;
}

/** A recorded outcome carries no shades: it went well or it did not. */
export function gradeFor(correct: boolean): ReadingGrade {
  return correct ? "good" : "again";
}

export function correctnessOfGrade(grade: string): boolean {
  return grade === "good" || grade === "easy";
}

/** Minutes of silence that end a sitting. Stated, so the denominator can be read. */
export const SESSION_GAP_MINUTES = 30;

export interface StoredAttemptRow {
  readonly conceptId: ConceptId;
  readonly retrievalType: string;
  readonly grade: string;
  readonly occurredAt: Date;
  readonly durationMs?: number | undefined;
}

/** A stable, human-checkable sitting id: the minute the sitting began. */
export function sittingIdOf(startedAt: Date): string {
  return `sit-${Math.floor(startedAt.getTime() / 60_000)}`;
}

/**
 * Rebuild the observation history.
 *
 * Rows may arrive in any order; they are sorted oldest first, clustered into
 * sittings, then walked concept by concept so each row can be asked which rung its
 * activity was built at.
 */
export function observationsFromRows(
  rows: readonly StoredAttemptRow[],
  options: { readonly hasTeacher: boolean },
): readonly ConceptObservation[] {
  const usable = rows
    .filter((row) => evidenceKindOfRetrieval(row.retrievalType) !== null)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const built: ConceptObservation[] = [];
  const perConcept = new Map<ConceptId, ConceptObservation[]>();
  let sittingStart: Date | null = null;
  let previous: Date | null = null;

  for (const row of usable) {
    if (
      sittingStart === null ||
      previous === null ||
      row.occurredAt.getTime() - previous.getTime() > SESSION_GAP_MINUTES * 60_000
    ) {
      sittingStart = row.occurredAt;
    }
    previous = row.occurredAt;

    const evidenceKind = evidenceKindOfRetrieval(row.retrievalType);
    const activityKind = activityKindOfRetrieval(row.retrievalType);
    if (evidenceKind === null || activityKind === null) continue;

    const history = perConcept.get(row.conceptId) ?? [];
    const workingOn = ladderState(row.conceptId, history, {
      hasTeacher: options.hasTeacher,
    }).workingOn;

    const observation: ConceptObservation = {
      conceptId: row.conceptId,
      correct: correctnessOfGrade(row.grade),
      at: row.occurredAt,
      activityKind,
      evidenceKind,
      presentation: presentationForActivity(workingOn, activityKind),
      sessionId: sittingIdOf(sittingStart),
      ...(row.durationMs === undefined ? {} : { elapsedMs: row.durationMs }),
    };

    history.push(observation);
    perConcept.set(row.conceptId, history);
    built.push(observation);
  }

  return built;
}
