import { notFound, redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { can } from "@/modules/platform/authz/can";
import {
  assignmentsFor,
  familyLinks,
  learnerFacts,
  recentAttempts,
} from "@/modules/classroom/repo/teacher-repo";
import { verdictHistory } from "@/modules/assessment/repo/verification-repo";
import { mushafViewFor } from "@/modules/classroom/repo/mushaf-view";
import { rate } from "@/modules/analytics/domain/denominator";
import { unitsIn, type ScopeItem } from "@/modules/classroom/domain/assignment-scope";
import { StudentProfileView } from "@/modules/classroom/ui/StudentProfileView";

/**
 * One student.
 *
 * Every rate is built with `rate()`, which refuses to produce a percentage
 * from too few observations and says "not yet recorded" instead. There is no
 * other way a number reaches this page.
 */
export default async function StudentPage({
  params,
}: {
  readonly params: Promise<{ readonly learnerId: string }>;
}) {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/teacher/sign-in");
  const actor = caller.actor;
  const { learnerId } = await params;

  if (!can(actor, "teach:viewStudent", { type: "learner", id: learnerId }).allowed) notFound();

  const now = new Date();
  const facts = await learnerFacts(actor.organizationId, learnerId, now);
  if (facts === null) notFound();

  const [attempts, verdicts, assignments, family] = await Promise.all([
    recentAttempts(actor.organizationId, learnerId),
    verdictHistory(actor.organizationId, learnerId),
    assignmentsFor(actor.organizationId, learnerId),
    familyLinks(actor.organizationId, learnerId),
  ]);

  /* The ink page shows the passage the most recent verdict was about, when
     there is one. With no verdict there is nothing to show, and the tab says
     so rather than picking an arbitrary page. */
  const view = await mushafViewFor(actor.organizationId, 78, 1, 20, learnerId);

  const unitsOf = (scope: unknown): number =>
    Array.isArray(scope)
      ? (scope as ScopeItem[]).reduce((total, item) => total + unitsIn(item), 0)
      : 0;

  return (
    <StudentProfileView
      learner={{
        userId: facts.userId,
        displayName: facts.displayName,
        tier: facts.tier,
        trackedUnits: facts.trackedUnits,
        verifiedUnits: facts.verifiedUnits,
        dueNow: facts.dueNow,
        lastActivityAt: facts.lastActivityAt?.toISOString() ?? null,
      }}
      attemptSuccess={rate(facts.successfulAttempts, facts.attempts)}
      verdictPass={rate(facts.verdictsPassed, facts.verdictsGiven)}
      lines={facts.trackedUnits === 0 ? [] : view.lines}
      page={view.page}
      weakJoins={[]}
      attempts={attempts.map((attempt) => ({
        id: attempt.id,
        unitId: attempt.unitId,
        retrievalType: attempt.retrievalType,
        grade: attempt.grade,
        occurredAt: attempt.occurredAt.toISOString(),
      }))}
      verdicts={verdicts.map((verdict) => ({
        id: verdict.id,
        verdict: verdict.verdict,
        corrections: verdict.corrections.length,
        decidedAt: verdict.decidedAt.toISOString(),
        decidedByName: verdict.decidedByName,
        evidenceKind: verdict.evidenceKind,
      }))}
      assignments={assignments.map((assignment) => ({
        id: assignment.id,
        track: assignment.track,
        units: unitsOf(assignment.scope),
        dueAt: assignment.dueAt?.toISOString() ?? null,
        completedAt: assignment.completedAt?.toISOString() ?? null,
      }))}
      family={family.map((link) => ({
        id: link.id,
        guardianName: link.guardianName,
        state: link.state,
        canTutor: link.canTutor,
      }))}
    />
  );
}
