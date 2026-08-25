import { getCaller } from "@/modules/identity/actions/session-context";
import { LinkForm } from "@/modules/family/ui/LinkForm";
import { SignedOut } from "@/modules/family/ui/SignedOut";
import { FamilyFrame } from "../FamilyFrame";

/** Claiming a child — a request, not an entitlement. */
export default async function LinkPage() {
  const caller = await getCaller();
  return (
    <FamilyFrame active="children" titleKey="family.link.title">
      {caller.kind === "authenticated" ? <LinkForm /> : <SignedOut />}
    </FamilyFrame>
  );
}
