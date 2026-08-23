/**
 * Test-only support for the Marginalia primitives.
 *
 * Not exported from either barrel, and never imported by product code.
 *
 * The vitest `unit` project collects `src/**​/*.test.ts`, so component tests are
 * written in `.ts` and build their trees with `h()` rather than JSX.
 */
import {
  createElement,
  type Attributes,
  type ComponentType,
  type JSX,
  type ReactElement,
  type ReactNode,
} from "react";
import { render, type RenderResult } from "@testing-library/react";
import { SurfaceProvider } from "../../theme/ThemeProvider";
import type { Theme, Tier } from "../../theme/tier";
import type { Locale } from "../../../platform/i18n/types";

/** `children` becomes optional in props, exactly as it is in JSX. */
type LooseChildren<P> = Omit<P, "children"> & Partial<Pick<P, Extract<keyof P, "children">>>;

/**
 * JSX-shaped `createElement`.
 *
 * React's own typing wants a required `children` to appear inside `props`,
 * while JSX takes it from the child arguments. This restores the JSX reading,
 * so a test looks like the markup a screen would actually write.
 */
export function h<K extends keyof JSX.IntrinsicElements>(
  type: K,
  props?: (JSX.IntrinsicElements[K] & Attributes) | null,
  ...children: readonly ReactNode[]
): ReactElement;
export function h<P extends object>(
  type: ComponentType<P>,
  props?: (LooseChildren<P> & Attributes) | null,
  ...children: readonly ReactNode[]
): ReactElement;
export function h(
  type: unknown,
  props?: object | null,
  ...children: readonly ReactNode[]
): ReactElement {
  return createElement(type as string, props as Record<string, unknown> | null, ...children);
}

export type SurfaceOptions = {
  readonly tier?: Tier;
  readonly theme?: Theme;
  readonly locale?: Locale;
};

/**
 * Every Marginalia component reads its tier, theme and translator from
 * <SurfaceProvider>, so every test renders inside one.
 */
export function renderSurface(ui: ReactNode, options: SurfaceOptions = {}): RenderResult {
  const { tier = "adult", theme = "light", locale = "en" } = options;
  return render(
    <SurfaceProvider tier={tier} theme={theme} locale={locale}>
      {ui}
    </SurfaceProvider>,
  );
}
