import { detectAnomaliesAcross, type Anomaly } from "../domain/anomalies";
import { ladderState } from "../domain/masteryLadder";
import { qaidahLessons } from "./lesson-content";
import { readingSnapshot } from "./reading-repo";
import type { ConceptId } from "../domain/concepts";
import type { LadderState } from "../domain/masteryLadder";

/**
 * Reading anomalies, for a teacher.
 *
 * `domain/anomalies.ts` has always been able to find the patterns worth a
 * teacher's attention — answers faster than anyone could read, accuracy
 * falling against a learner's own earlier sessions, errors piling on one
 * concept, a long silence, a rung approached and never crossed. It is 386
 * lines with its own tests, exported from the barrel, and until now it was
 * read by nothing: no repo, no action, no page. A teacher was never told.
 *
 * This is the read side. It computes nothing itself — the engine does that,
 * from observations, with the denominator attached to every finding.
 */

export type LearnerAnomalies = {
  readonly learnerUserId: string;
  readonly displayName: string;
  readonly anomalies: readonly Anomaly[];
};

/** Every concept the Qāʿidah lessons teach, deduplicated and ordered. */
export function taughtConceptIds(): readonly ConceptId[] {
  const seen = new Set<ConceptId>();
  for (const lesson of qaidahLessons()) {
    for (const conceptId of lesson.conceptIds) seen.add(conceptId);
  }
  return [...seen].sort();
}

/**
 * What a class's reading looks like, learner by learner.
 *
 * A learner with nothing to say about them is absent from the result rather
 * than present with an empty list: "no anomalies" and "not enough evidence to
 * say" are the same silence here, and neither is a finding.
 */
export async function readingAnomaliesFor(
  organizationId: string,
  learners: readonly { readonly userId: string; readonly displayName: string }[],
  now: Date = new Date(),
): Promise<readonly LearnerAnomalies[]> {
  const conceptIds = taughtConceptIds();
  if (conceptIds.length === 0) return [];

  const found: LearnerAnomalies[] = [];
  for (const learner of learners) {
    const snapshot = await readingSnapshot(organizationId, learner.userId, conceptIds, now);
    if (snapshot.observations.length === 0) continue;

    const ladders = new Map<ConceptId, LadderState>(
      conceptIds.map((conceptId) => [
        conceptId,
        ladderState(conceptId, snapshot.observations, { hasTeacher: snapshot.hasTeacher }),
      ]),
    );
    const anomalies = detectAnomaliesAcross(conceptIds, snapshot.observations, now, ladders);
    if (anomalies.length === 0) continue;
    found.push({
      learnerUserId: learner.userId,
      displayName: learner.displayName,
      anomalies,
    });
  }
  return found;
}
