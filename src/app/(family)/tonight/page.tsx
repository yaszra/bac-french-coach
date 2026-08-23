import { getCaller } from "@/modules/identity/actions/session-context";
import { can } from "@/modules/platform/authz/can";
import { listChildren } from "@/modules/family/repo/family-repo";
import { readReportRun } from "@/modules/analytics/repo/report-repo";
import { localDate } from "@/modules/platform/jobs/handlers/evening";
import { TonightView } from "@/modules/family/ui/TonightView";
import { PendingClaimNotice } from "@/modules/family/ui/PendingClaimNotice";
import { SignedOut } from "@/modules/family/ui/SignedOut";
import type { Tonight } from "@/modules/family/domain/tonight";
import { FamilyFrame } from "../FamilyFrame";

/**
 * Tonight's report.
 *
 * The report is NOT built here. It is written each evening by a job, at the
 * family's own local hour, and this page reads the run it produced — so a page
 * that loads slowly never becomes a report that disagrees with the one sent an
 * hour ago, and a report that has not been built says exactly that.
 */
export default async function TonightPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") {
    return (
      <FamilyFrame active="tonight" titleKey="family.tonight.title">
        <SignedOut />
      </FamilyFrame>
    );
  }

  const actor = caller.actor;
  const params = await searchParams;
  const requested = typeof params.child === "string" ? params.child : null;
  const children = await listChildren(actor.organizationId, actor.userId);
  const child = children.find((c) => c.learnerUserId === requested) ?? children[0];

  // A claim is not access. `can()` refuses first; the page then says why,
  // rather than rendering an empty report that looks like a quiet day.
  const decision = child
    ? can(actor, "family:viewChild", { type: "learner", id: child.learnerUserId })
    : { allowed: false as const, reason: "no_relationship" };

  if (!child || !decision.allowed) {
    return (
      <FamilyFrame active="tonight" titleKey="family.tonight.title">
        <PendingClaimNotice
          childName={child?.displayName ?? ""}
          reason={child ? ("reason" in decision ? decision.reason : "no_relationship") : "no_relationship"}
        />
      </FamilyFrame>
    );
  }

  const now = new Date();
  const forDate = localDate(child.timezone, now);
  const run = await readReportRun(
    actor.organizationId,
    "nightly_parent",
    "learner",
    child.learnerUserId,
    new Date(`${forDate}T00:00:00Z`),
  );

  const state = run === null ? "not_built" : run.state === "completed" ? "ready" : run.state === "failed" ? "failed" : "not_built";
  const tonight = (run?.payload ?? null) as Tonight | null;

  return (
    <FamilyFrame active="tonight" titleKey="family.tonight.title">
      {tonight && state === "ready" ? (
        <TonightView tonight={tonight} reportState="ready" />
      ) : (
        <TonightView
          tonight={placeholder(child.learnerUserId, child.displayName, forDate)}
          reportState={state === "failed" ? "failed" : "not_built"}
        />
      )}
    </FamilyFrame>
  );
}

/** Only ever rendered behind a non-ready state, which shows no figures at all. */
function placeholder(learnerUserId: string, childName: string, forDate: string): Tonight {
  return {
    learnerUserId,
    childName,
    forDate,
    state: "quiet",
    headlineKey: "family.tonight.quietDay",
    minutesPractised: 0,
    reviews: { done: 0, due: 0 },
    unassistedRecall: { kind: "not_yet_recorded", denominator: 0, needed: 5 },
    actions: [],
    trend: { kind: "no_comparison", wordsHeld: 0 },
    approvals: [],
    homeTask: {
      id: "listen_together",
      labelKey: "family.task.listenTogether.label",
      descriptionKey: "family.task.listenTogether.description",
      minutes: 5,
      needsAdult: true,
    },
  };
}
