/**
 * Design tokens as CSS custom properties.
 *
 * Generated from `src/config/brand.ts` so there is exactly one place a
 * colour, radius, or duration is defined. A stylesheet that hard-codes a
 * hex value has escaped the design system, and the token test will not
 * protect it.
 */
import {
  colorTokens,
  layoutTokens,
  motionTokens,
  textColorTokens,
  typography,
} from "../config/brand.js";

/**
 * Muṣḥaf geometry.
 *
 * The Madani page is fifteen lines. This is not a style preference: it is
 * the printed layout the learner is memorising positions within, so it is
 * invariant across locale, theme, and viewport.
 */
export const mushafGeometry = {
  linesPerPage: 15,
  /** Opening pages legitimately carry fewer lines. */
  lineCountExceptions: { 1: 8, 2: 8 } as Readonly<Record<number, number>>,
  /** Page aspect ratio, held constant so line positions never shift. */
  aspectRatio: 0.66,
} as const;

export function linesOnPage(pageNumber: number): number {
  return (
    mushafGeometry.lineCountExceptions[pageNumber] ?? mushafGeometry.linesPerPage
  );
}

/**
 * The full token sheet.
 *
 * Dark mode darkens the application surround only. The muṣḥaf page keeps
 * warm paper and accessible ink in every theme: sacred text is never
 * inverted or tinted.
 */
export function tokenStylesheet(): string {
  return `:root {
  --athar-paper: ${colorTokens.paper};
  --athar-canvas: ${colorTokens.canvas};
  --athar-ink: ${colorTokens.ink};
  --athar-night: ${colorTokens.night};
  --athar-indigo: ${colorTokens.deepIndigo};
  --athar-sage: ${colorTokens.sage};
  --athar-copper: ${colorTokens.copper};
  --athar-mist: ${colorTokens.mist};
  --athar-warning: ${colorTokens.warning};
  --athar-error: ${colorTokens.error};
  --athar-warning-text: ${textColorTokens.warningText};
  --athar-copper-text: ${textColorTokens.copperText};

  --athar-surface: var(--athar-canvas);
  --athar-on-surface: var(--athar-ink);
  --athar-border: var(--athar-mist);

  --athar-space: ${layoutTokens.spacingGridPx}px;
  --athar-radius: ${layoutTokens.defaultRadiusPx}px;
  --athar-touch-target: ${layoutTokens.minTouchTargetPx}px;

  --athar-motion-micro: ${motionTokens.microFeedback}ms;
  --athar-motion-state: ${motionTokens.stateChange}ms;
  --athar-motion-page: ${motionTokens.pageTransition}ms;

  --athar-font-latin: "${typography.latinUi}", system-ui, sans-serif;
  --athar-font-arabic: "${typography.arabicUi}", system-ui, sans-serif;
  --athar-font-quran: "${typography.quranic}", serif;
}

/* Dark mode darkens the surround. The page below stays paper. */
:root[data-theme="dark"] {
  --athar-surface: var(--athar-night);
  --athar-on-surface: var(--athar-paper);
  --athar-border: color-mix(in srgb, var(--athar-mist) 25%, var(--athar-night));
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --athar-surface: var(--athar-night);
    --athar-on-surface: var(--athar-paper);
    --athar-border: color-mix(in srgb, var(--athar-mist) 25%, var(--athar-night));
  }
}

/*
 * The muṣḥaf page is exempt from theming by design. Both selectors are
 * stated explicitly so no future dark-mode rule can capture it.
 */
.athar-mushaf,
:root[data-theme="dark"] .athar-mushaf {
  background: var(--athar-paper);
  color: var(--athar-ink);
}

/* Motion is disabled, not merely shortened. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Every interactive target meets the minimum size. */
button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"]) {
  min-height: var(--athar-touch-target);
  min-width: var(--athar-touch-target);
}

/* Focus is always visible, and never removed without replacement. */
:focus-visible {
  outline: 3px solid var(--athar-indigo);
  outline-offset: 2px;
}
`;
}
