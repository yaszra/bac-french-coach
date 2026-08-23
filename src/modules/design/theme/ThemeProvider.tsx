"use client";

import { createContext, useContext } from "react";
import type { Tier, Theme } from "./tier";
import type { Locale } from "../../platform/i18n/types";
import { translator, type Translate } from "../../platform/i18n/translate";
import { directionOf } from "../../platform/i18n/types";

export type SurfaceContext = {
  readonly tier: Tier;
  readonly theme: Theme;
  readonly locale: Locale;
  readonly dir: "ltr" | "rtl";
  readonly t: Translate;
};

const SurfaceCtx = createContext<SurfaceContext | null>(null);

export function SurfaceProvider({
  tier,
  theme,
  locale,
  children,
}: {
  tier: Tier;
  theme: Theme;
  locale: Locale;
  children: React.ReactNode;
}) {
  const value: SurfaceContext = {
    tier,
    theme,
    locale,
    dir: directionOf(locale),
    t: translator(locale),
  };
  return <SurfaceCtx.Provider value={value}>{children}</SurfaceCtx.Provider>;
}

/** Every Marginalia component reads its tier, theme, direction and translator here. */
export function useSurface(): SurfaceContext {
  const ctx = useContext(SurfaceCtx);
  if (!ctx) {
    throw new Error("useSurface must be used inside <SurfaceProvider>");
  }
  return ctx;
}
