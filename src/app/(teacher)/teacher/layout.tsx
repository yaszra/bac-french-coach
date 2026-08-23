import { Suspense, type ReactNode } from "react";
import { getCaller } from "@/modules/identity/actions/session-context";
import { TeacherSurface } from "@/modules/classroom/ui/TeacherSurface";
import type { Locale } from "@/modules/platform/i18n/types";

export const metadata = { title: "Itqān — teacher console" };

/**
 * The teacher console's outermost layer.
 *
 * It resolves the caller only to learn which language to speak — authorisation
 * happens one layer in, so that the sign-in page can live under the same
 * surface without the layout redirecting it into a loop.
 */
export default async function TeacherLayout({ children }: { readonly children: ReactNode }) {
  const caller = await getCaller();
  const locale: Locale = caller.kind === "authenticated" ? caller.actor.locale : "en";

  return (
    <Suspense fallback={null}>
      <TeacherSurface locale={locale}>{children}</TeacherSurface>
    </Suspense>
  );
}
