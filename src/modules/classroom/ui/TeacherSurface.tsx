"use client";

import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { SurfaceProvider } from "../../design/theme/ThemeProvider";
import { ToastRegion } from "../../design/ui/feedback";
import { THEMES, type Theme } from "../../design/theme/tier";
import { LOCALES, directionOf, type Locale } from "../../platform/i18n/types";

/**
 * The teacher console's surface.
 *
 * A teacher is always the `adult` tier: the tier system exists to shape a
 * CHILD's screen, and applying it to a professional tool would be a category
 * error. Locale comes from the signed-in account, so the console speaks the
 * language the teacher chose, not the language of the browser they borrowed.
 *
 * Theme and locale may be overridden from the query string. That is not a user
 * feature — it is what makes the visual-regression suite deterministic, and it
 * is why `data-surface-ready` is stamped last.
 */
export type TeacherSurfaceProps = {
  readonly locale: Locale;
  readonly children: ReactNode;
};

function pick<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

export function TeacherSurface({ locale, children }: TeacherSurfaceProps) {
  const params = useSearchParams();
  const theme: Theme = pick(THEMES, params.get("theme"), "light");
  const resolved: Locale = pick(LOCALES, params.get("locale"), locale);
  const dir = directionOf(resolved);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-tier", "adult");
    root.setAttribute("lang", resolved);
    root.setAttribute("dir", dir);
    root.setAttribute("data-surface-ready", "true");
    return () => {
      root.removeAttribute("data-surface-ready");
    };
  }, [theme, resolved, dir]);

  return (
    <SurfaceProvider theme={theme} tier="adult" locale={resolved}>
      <ToastRegion>{children}</ToastRegion>
    </SurfaceProvider>
  );
}
