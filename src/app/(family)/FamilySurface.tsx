"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { SurfaceProvider } from "@/modules/design/theme/ThemeProvider";
import { ToastRegion } from "@/modules/design/ui/feedback";
import { THEMES, type Theme } from "@/modules/design/theme/tier";
import { directionOf, type Locale } from "@/modules/platform/i18n/types";

/**
 * Whether this guardian tutors anyone, resolved on the server once per request.
 *
 * Only the navigation reads it. It is not an authorisation decision and is
 * never treated as one: every tutoring page checks `can()` for itself.
 */
const TutoringContext = createContext(false);

export function useTutoring(): boolean {
  return useContext(TutoringContext);
}

/**
 * The family surface.
 *
 * A guardian is always an adult surface: the tier axis exists for children, and
 * a parent app that shrank to the kids tier because a kid's account was linked
 * would be a category error. Theme is a preference and honours `?theme=`, which
 * is also what makes a deterministic screenshot possible.
 */
export function FamilySurface({
  theme,
  locale,
  tutoring = false,
  children,
}: {
  readonly theme: Theme;
  readonly locale: Locale;
  readonly tutoring?: boolean | undefined;
  readonly children: ReactNode;
}) {
  const params = useSearchParams();
  const requested = params.get("theme");
  const active: Theme = THEMES.find((candidate) => candidate === requested) ?? theme;
  const dir = directionOf(locale);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", active);
    root.setAttribute("data-tier", "adult");
    root.setAttribute("lang", locale);
    root.setAttribute("dir", dir);
    root.setAttribute("data-surface-ready", "true");
  }, [active, locale, dir]);

  return (
    <SurfaceProvider theme={active} tier="adult" locale={locale}>
      <TutoringContext.Provider value={tutoring}>
        <ToastRegion>{children}</ToastRegion>
      </TutoringContext.Provider>
    </SurfaceProvider>
  );
}
