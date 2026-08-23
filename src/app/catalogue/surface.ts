import { THEMES, TIERS, type Theme, type Tier } from "@/modules/design/theme/tier";
import { LOCALES, directionOf, type Locale } from "@/modules/platform/i18n/types";

/**
 * The catalogue's surface comes entirely from the URL —
 * `?theme=dark&tier=kids&locale=ar` — so every screenshot is deterministic and
 * no client state exists to drift.
 */
export type CatalogueSurface = {
  readonly theme: Theme;
  readonly tier: Tier;
  readonly locale: Locale;
  readonly dir: "ltr" | "rtl";
};

export const SURFACE_KEYS = ["theme", "tier", "locale"] as const;
export type SurfaceKey = (typeof SURFACE_KEYS)[number];

export const SURFACE_VALUES: Readonly<Record<SurfaceKey, readonly string[]>> = {
  theme: THEMES,
  tier: TIERS,
  locale: LOCALES,
};

export const DEFAULT_SURFACE: CatalogueSurface = {
  theme: "light",
  tier: "adult",
  locale: "en",
  dir: "ltr",
};

function pick<T extends string>(allowed: readonly T[], value: string | null | undefined, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

export function resolveSurface(params: {
  readonly theme?: string | null | undefined;
  readonly tier?: string | null | undefined;
  readonly locale?: string | null | undefined;
}): CatalogueSurface {
  const locale = pick(LOCALES, params.locale, DEFAULT_SURFACE.locale);
  return {
    theme: pick(THEMES, params.theme, DEFAULT_SURFACE.theme),
    tier: pick(TIERS, params.tier, DEFAULT_SURFACE.tier),
    locale,
    dir: directionOf(locale),
  };
}

/** A link to the same page in a different surface. */
export function surfaceHref(
  pathname: string,
  surface: CatalogueSurface,
  override: Partial<Record<SurfaceKey, string>>,
): string {
  const query = new URLSearchParams({
    theme: surface.theme,
    tier: surface.tier,
    locale: surface.locale,
    ...override,
  });
  return `${pathname}?${query.toString()}`;
}
