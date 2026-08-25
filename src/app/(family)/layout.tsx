import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { getCaller } from "@/modules/identity/actions/session-context";
import { can } from "@/modules/platform/authz/can";
import { THEMES, type Theme } from "@/modules/design/theme/tier";
import type { Locale } from "@/modules/platform/i18n/types";
import { FamilySurface } from "./FamilySurface";

export const metadata = { title: "Itqān — Family" };

/** Resolved once per request, on the server: locale from the account, theme from a cookie. */
export default async function FamilyLayout({ children }: { readonly children: ReactNode }) {
  const caller = await getCaller();
  const jar = await cookies();
  const stored = jar.get("itqan-theme")?.value;
  const theme: Theme = THEMES.find((candidate) => candidate === stored) ?? "light";
  const locale: Locale = caller.kind === "authenticated" ? caller.actor.locale : "en";

  /* Whether this guardian tutors anyone at all, resolved once for the whole
     surface. It decides only whether the tutoring tab exists: every page
     behind it checks authorisation for itself, because a hidden tab is not a
     permission check. Computed here rather than per page so the navigation is
     the same on every screen instead of appearing and disappearing. */
  const tutoring =
    caller.kind === "authenticated" &&
    caller.actor.relationships.some(
      (link) =>
        can(caller.actor, "teach:verifyRecitation", { type: "learner", id: link.learnerUserId })
          .allowed,
    );

  return (
    <Suspense fallback={null}>
      <FamilySurface theme={theme} locale={locale} tutoring={tutoring}>
        {children}
      </FamilySurface>
    </Suspense>
  );
}
