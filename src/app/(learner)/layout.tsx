import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { getCaller } from "@/modules/identity/actions/session-context";
import { THEMES, type Theme, type Tier } from "@/modules/design/theme/tier";
import type { Locale } from "@/modules/platform/i18n/types";
import { LearnerSurface } from "./LearnerSurface";
import { RegisterServiceWorker } from "./RegisterServiceWorker";
import styles from "./learner.module.css";

export const metadata = { title: "Itqān" };

/**
 * The learner surface is resolved here, on the server, once per request.
 *
 * The tier comes from the account and nowhere else. An adult sets it for a
 * child; the child's browser has no say in it, so nothing below this layout ever
 * needs to ask whether a tier can be trusted.
 *
 * A signed-out visitor still gets a surface — the sign-in page lives inside this
 * group — and it is the neutral one: adult tier, the interface's default locale.
 */
export default async function LearnerLayout({ children }: { readonly children: ReactNode }) {
  const caller = await getCaller();
  const jar = await cookies();
  const stored = jar.get("itqan-theme")?.value;
  const theme: Theme = THEMES.find((candidate) => candidate === stored) ?? "light";

  const tier: Tier = caller.kind === "authenticated" ? (caller.actor.tier ?? "adult") : "adult";
  const locale: Locale = caller.kind === "authenticated" ? caller.actor.locale : "en";

  return (
    <Suspense fallback={null}>
      <LearnerSurface tier={tier} theme={theme} locale={locale}>
        <RegisterServiceWorker />
        <div className={styles.root}>{children}</div>
      </LearnerSurface>
    </Suspense>
  );
}
