import { notFound, redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { listClassrooms, listLearners } from "@/modules/classroom/repo/teacher-repo";
import { pendingVerification, pendingVerifications } from "@/modules/assessment/repo/verification-repo";
import { mushafViewFor, parseUnitScope } from "@/modules/classroom/repo/mushaf-view";
import { VerificationConsole } from "@/modules/assessment/ui/VerificationConsole";

/**
 * One verification, with the page in front of the teacher.
 *
 * The muṣḥaf lines are resolved on the SERVER from the content package, so the
 * scripture on this screen has travelled from the vendored corpus to the
 * browser and nowhere else. The client component receives words and positions;
 * it never asks for text and never sends any back.
 */
export default async function VerifyOnePage({
  params,
}: {
  readonly params: Promise<{ readonly requestId: string }>;
}) {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/teacher/sign-in");
  const actor = caller.actor;

  const { requestId } = await params;
  const request = await pendingVerification(actor.organizationId, requestId);
  if (request === null) notFound();

  const scope = parseUnitScope(request.unitScope);
  const view =
    scope === null
      ? { lines: [], page: null, sura: 0, ayahFrom: 0, ayahTo: 0 }
      : /* Full ink, deliberately. Ink depth is the LEARNER's progress language:
           a word they have not earned yet is a blank space on their screen, and
           that is right for them. A teacher listening needs to READ the page —
           a half-blank muṣḥaf would make them unable to follow the recitation
           they are judging. The learner's depths belong on their profile. */
        await mushafViewFor(actor.organizationId, scope.sura, scope.ayahFrom, scope.ayahTo);

  /* The rest of the queue, so "record and next" knows where next is. */
  const classrooms = await listClassrooms(actor.organizationId, actor.userId);
  const classroom = classrooms[0] ?? null;
  const learners = classroom === null ? [] : await listLearners(actor.organizationId, classroom.id);
  const queue = await pendingVerifications(
    actor.organizationId,
    learners.map((learner) => learner.userId),
  );
  const rest = queue.filter((entry) => entry.id !== request.id);
  const next = rest[0] ?? null;

  const unitIds =
    scope === null
      ? []
      : Array.from({ length: Math.max(0, scope.ayahTo - scope.ayahFrom + 1) }, (_, index) =>
          `b:${scope.sura}:${scope.ayahFrom + index}`,
        );

  return (
    <VerificationConsole
      view={{
        requestId: request.id,
        learnerUserId: request.learnerUserId,
        learnerName: request.learnerName,
        unitIds,
        scopeLabel:
          scope === null
            ? ""
            : `${scope.sura}:${scope.ayahFrom}–${scope.ayahTo}`,
        lines: view.lines,
        page: view.page,
        sura: view.sura,
        nextHref: next === null ? null : `/teacher/verify/${next.id}`,
        remaining: rest.length,
      }}
    />
  );
}
