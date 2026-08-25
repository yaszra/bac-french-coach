import { getCaller } from "@/modules/identity/actions/session-context";
import { listChildren } from "@/modules/family/repo/family-repo";
import { ChildrenView } from "@/modules/family/ui/ChildrenView";
import { SignedOut } from "@/modules/family/ui/SignedOut";
import { FamilyFrame } from "../FamilyFrame";

/**
 * Who a guardian is linked to.
 *
 * This page reads relationships and names — never a child's learning data —
 * so it is safe to render for a guardian whose claim is still pending.
 */
export default async function ChildrenPage() {
  const caller = await getCaller();

  return (
    <FamilyFrame active="children" titleKey="family.children.title">
      {caller.kind !== "authenticated" ? (
        <SignedOut />
      ) : (
        <ChildrenView links={await listChildren(caller.actor.organizationId, caller.actor.userId)} />
      )}
    </FamilyFrame>
  );
}
