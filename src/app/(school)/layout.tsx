import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { getCaller } from "@/modules/identity/actions/session-context";
import { THEMES, type Theme } from "@/modules/design/theme/tier";
import type { Locale } from "@/modules/platform/i18n/types";
import { SchoolSurface } from "./SchoolSurface";

export const metadata = { title: "Itqān — School" };

export default async function SchoolLayout({ children }: { readonly children: ReactNode }) {
  const caller = await getCaller();
  const jar = await cookies();
  const stored = jar.get("itqan-theme")?.value;
  const theme: Theme = THEMES.find((candidate) => candidate === stored) ?? "light";
  const locale: Locale = caller.kind === "authenticated" ? caller.actor.locale : "en";

  return (
    <Suspense fallback={null}>
      <SchoolSurface theme={theme} locale={locale}>
        {children}
      </SchoolSurface>
    </Suspense>
  );
}
