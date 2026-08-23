"use client";

import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { SurfaceProvider } from "@/modules/design/theme/ThemeProvider";
import { THEMES, type Theme } from "@/modules/design/theme/tier";
import { directionOf, type Locale } from "@/modules/platform/i18n/types";

/** The school surface: desktop, adult tier, theme honoured from the URL. */
export function SchoolSurface({
  theme,
  locale,
  children,
}: {
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
    root.setAttribute("data-tier", "adult");
    root.setAttribute("lang", locale);
    root.setAttribute("dir", dir);
    root.setAttribute("data-surface-ready", "true");
  }, [active, locale, dir]);

  return (
    <SurfaceProvider theme={active} tier="adult" locale={locale}>
      {children}
    </SurfaceProvider>
  );
}
