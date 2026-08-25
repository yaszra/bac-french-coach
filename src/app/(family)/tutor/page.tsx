import { getCaller } from "@/modules/identity/actions/session-context";
import { can } from "@/modules/platform/authz/can";
import { listChildren } from "@/modules/family/repo/family-repo";
import { pendingVerifications } from "@/modules/assessment/repo/verification-repo";
import { guardianOwnsRequest } from "@/modules/family/repo/tutoring-repo";
import { parseUnitScope } from "@/modules/classroom/repo/mushaf-view";
import { TutoringList } from "@/modules/family/ui/TutoringList";
import { SignedOut } from "@/modules/family/ui/SignedOut";
import { FamilyFrame } from "../FamilyFrame";

/**
 * Where a guardian who tutors actually tutors.
 *
 * `canTutor` on a guardian link has always unlocked hearing a child and
 * recording a verdict — `can()` enforces it, and the verdict action refuses
 * without it — but the family app had no screen on which to do either. A
 * permission with nowhere to exercise it is not a permission; this is the
 * missing half.
 *
 * The bar is the same one a teacher passes. Nothing here weakens it: the
 * verdict is recorded by the same action, against the same authorisation
 * check, and a guardian without `canTutor` sees only that a teacher has not
 * granted it — never a listening screen they may not use.
 */
export default async function TutorPage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") {
    return (
      <FamilyFrame active="children" titleKey="family.tutor.title">
        <SignedOut />
      </FamilyFrame>
    );
  }
  const actor = caller.actor;

  const children = await listChildren(actor.organizationId, actor.userId);
  const tutorable = children.filter(
    (child) =>
      can(actor, "teach:verifyRecitation", { type: "learner", id: child.learnerUserId }).allowed,
  );

  const queue =
    tutorable.length === 0
      ? []
      : await pendingVerifications(
          actor.organizationId,
          tutorable.map((child) => child.learnerUserId),
        );

  /* Work a teacher set is heard by that teacher. The server refuses either
     way, but offering a request only to refuse it would be a screen that
     wastes a parent's evening. */
  const decidable = await Promise.all(
    queue.map(async (request) => ({
      request,
      mine: (await guardianOwnsRequest(actor.organizationId, actor.userId, request.id)).ok,
    })),
  );
  const waiting = decidable.filter((entry) => entry.mine).map((entry) => entry.request);

  return (
    <FamilyFrame active="children" titleKey="family.tutor.title">
      <TutoringList
        tutorable={tutorable.map((child) => ({
          learnerUserId: child.learnerUserId,
          displayName: child.displayName,
        }))}
        /* A guardian who tutors nobody is told that plainly, and told who
           grants it — not shown an empty queue that reads like a quiet week. */
        hasChildren={children.length > 0}
        waiting={waiting.map((request) => {
          const scope = parseUnitScope(request.unitScope);
          return {
            id: request.id,
            learnerName: request.learnerName,
            waitingHours: request.waitingHours,
            scopeLabel:
              scope === null ? null : `${scope.sura}:${scope.ayahFrom}–${scope.ayahTo}`,
          };
        })}
      />
    </FamilyFrame>
  );
}
