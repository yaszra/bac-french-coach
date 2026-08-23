/**
 * Test-only helper. Every Marginalia component reads its tier, theme and
 * translator from <SurfaceProvider>, so every test renders inside one.
 *
 * Not exported from the barrel and never imported by product code.
 */
import { createElement, type ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { SurfaceProvider } from "../../theme/ThemeProvider";
import type { Theme, Tier } from "../../theme/tier";
import type { Locale } from "../../../platform/i18n/types";

export type SurfaceOptions = {
  readonly tier?: Tier;
  readonly theme?: Theme;
  readonly locale?: Locale;
};

export function renderSurface(ui: ReactNode, options: SurfaceOptions = {}): RenderResult {
  const { tier = "adult", theme = "light", locale = "en" } = options;
  return render(createElement(SurfaceProvider, { tier, theme, locale, children: ui }));
}
