import { notFound, redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { can } from "@/modules/platform/authz/can";
import { listChildren } from "@/modules/family/repo/family-repo";
import { pendingVerification, pendingVerifications } from "@/modules/assessment/repo/verification-repo";
import { mushafViewFor, parseUnitScope } from "@/modules/classroom/repo/mushaf-view";
import { VerificationConsole } from "@/modules/assessment/ui/VerificationConsole";
import { FamilyFrame } from "../../FamilyFrame";

/**
 * One child, heard by the guardian who was granted tutoring.
 *
 * This is the teacher's console, unchanged — the same component, the same
 * verdict action, the same correction taxonomy. A verdict from a tutoring
 * guardian is a real verdict because it is given by a real person listening,
 * and the record says who gave it. What differs is only the frame around it
 * and where "next" goes.
 */
export default async function TutorOnePage({
  params,
}: {
  readonly params: Promise<{ readonly requestId: string }>;
}) {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/sign-in");
  const actor = caller.actor;

  const { requestId } = await params;
  const request = await pendingVerification(actor.organizationId, requestId);
  if (request === null) notFound();

  // Authorisation before content: the page is not built for someone who may
  // not hear this child, so nothing about them is read.
  if (!can(actor, "teach:verifyRecitation", { type: "learner", id: request.learnerUserId }).allowed) {
    notFound();
  }

  const scope = parseUnitScope(request.unitScope);
  const view =
    scope === null
      ? { lines: [], page: null, sura: 0 }
      : /* Full ink: someone listening has to READ the page. Ink depth is the
           learner's own progress language and belongs on the learner's screen,
           not on the screen of the person following their recitation. */
        await mushafViewFor(actor.organizationId, scope.sura, scope.ayahFrom, scope.ayahTo);

  /* "Next" stays inside this guardian's own children — never the school's
     queue, which is not theirs to work through. */
  const children = await listChildren(actor.organizationId, actor.userId);
  const mine = children
    .filter((child) => can(actor, "teach:verifyRecitation", { type: "learner", id: child.learnerUserId }).allowed)
    .map((child) => child.learnerUserId);
  const queue = await pendingVerifications(actor.organizationId, mine);
  const rest = queue.filter((entry) => entry.id !== request.id);
  const next = rest[0] ?? null;

  const unitIds =
    scope === null
      ? []
      : Array.from({ length: Math.max(0, scope.ayahTo - scope.ayahFrom + 1) }, (_, index) =>
          `b:${scope.sura}:${scope.ayahFrom + index}`,
        );

  return (
    <FamilyFrame active="children" titleKey="family.tutor.title">
      <VerificationConsole
        view={{
          requestId: request.id,
          learnerUserId: request.learnerUserId,
          learnerName: request.learnerName,
          unitIds,
          scopeLabel: scope === null ? "" : `${scope.sura}:${scope.ayahFrom}–${scope.ayahTo}`,
          lines: view.lines,
          page: view.page,
          sura: view.sura,
          nextHref: next === null ? null : `/tutor/${next.id}`,
          remaining: rest.length,
        }}
      />
    </FamilyFrame>
  );
}
