import { getCaller } from "@/modules/identity/actions/session-context";
import { can } from "@/modules/platform/authz/can";
import { listChildren } from "@/modules/family/repo/family-repo";
import { listDataRequests, readConsents } from "@/modules/family/repo/privacy-repo";
import { CONSENT_PURPOSES } from "@/modules/family/domain/consent";
import { SettingsView } from "@/modules/family/ui/SettingsView";
import { PendingClaimNotice } from "@/modules/family/ui/PendingClaimNotice";
import { SignedOut } from "@/modules/family/ui/SignedOut";
import { FamilyFrame } from "../FamilyFrame";

/** Consent and data rights for one child, and the real state of every request. */
export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") {
    return (
      <FamilyFrame active="settings" titleKey="family.settings.title">
        <SignedOut />
      </FamilyFrame>
    );
  }

  const actor = caller.actor;
  const params = await searchParams;
  const requested = typeof params.child === "string" ? params.child : null;
  const children = await listChildren(actor.organizationId, actor.userId);
  const child = children.find((c) => c.learnerUserId === requested) ?? children[0];

  const decision = child
    ? can(actor, "family:manageConsent", { type: "learner", id: child.learnerUserId })
    : { allowed: false as const, reason: "no_relationship" };

  if (!child || !decision.allowed) {
    return (
      <FamilyFrame active="settings" titleKey="family.settings.title">
        <PendingClaimNotice
          childName={child?.displayName ?? ""}
          reason={child ? ("reason" in decision ? decision.reason : "no_relationship") : "no_relationship"}
        />
      </FamilyFrame>
    );
  }

  const [consents, requests] = await Promise.all([
    readConsents(actor.organizationId, child.learnerUserId, CONSENT_PURPOSES),
    listDataRequests(actor.organizationId, child.learnerUserId),
  ]);

  return (
    <FamilyFrame active="settings" titleKey="family.settings.title">
      <SettingsView
        childName={child.displayName}
        learnerUserId={child.learnerUserId}
        consents={consents}
        requests={requests}
        now={new Date()}
      />
    </FamilyFrame>
  );
}
