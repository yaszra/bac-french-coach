"use client";

import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { SurfaceProvider } from "@/modules/design/theme/ThemeProvider";
import { ToastRegion } from "@/modules/design/ui/feedback";
import { THEMES, type Theme, type Tier } from "@/modules/design/theme/tier";
import { directionOf, type Locale } from "@/modules/platform/i18n/types";

/**
 * The learner's surface.
 *
 * TIER IS NOT NEGOTIABLE FROM THE CLIENT. It arrives as a prop, resolved on the
 * server from the account — a child cannot promote themselves to the adult
 * surface by editing a URL, which is the whole point of a guided tier.
 *
 * Theme is different: it is a preference, not an authority, so a `?theme=`
 * override is honoured (and is what makes a deterministic screenshot possible).
 */
export function LearnerSurface({
  tier,
  theme,
  locale,
  children,
}: {
  readonly tier: Tier;
  readonly theme: Theme;
  readonly locale: Locale;
  readonly children: ReactNode;
}) {
  const params = useSearchParams();
  const requested = params.get("theme");
  const active: Theme = THEMES.find((candidate) => candidate === requested) ?? theme;
  const dir = directionOf(locale);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", active);
    root.setAttribute("data-tier", tier);
    root.setAttribute("lang", locale);
    root.setAttribute("dir", dir);
    root.setAttribute("data-surface-ready", "true");
  }, [active, tier, locale, dir]);

  return (
    <SurfaceProvider theme={active} tier={tier} locale={locale}>
      <ToastRegion>{children}</ToastRegion>
    </SurfaceProvider>
  );
}
