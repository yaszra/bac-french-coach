/**
 * Central brand configuration.
 *
 * ATHAR is a working creative direction, not a cleared trademark, domain,
 * or linguistically reviewed name. Every user-visible brand string in the
 * product must come from this module so the name can change without
 * touching product logic. Arabic copy requires review by a qualified
 * Arabic linguist before release.
 */
export const brand = {
  /** Latin product name. */
  name: "ATHAR",
  /** Arabic product name. NOT linguistically cleared — see module docs. */
  nameArabic: "أَثَر",
  /** English descriptor shown alongside the name. */
  descriptor: "Qur'an Memory System",
  tagline: "Memory made visible.",
  /** True until trademark/domain/linguistic clearance is recorded. */
  provisional: true,
} as const;

/**
 * "Paper, ink, and light" design tokens.
 * All foreground/background pairings must be verified against WCAG 2.2 AA
 * (see docs/04-design-system.md for the verified pairing matrix).
 */
export const colorTokens = {
  paper: "#FBF8F1", // mushaf paper and warm surfaces
  canvas: "#F3F5F3", // application background
  ink: "#18211F", // primary text
  night: "#101923", // dark surround, high-trust contrast
  deepIndigo: "#29466B", // primary actions and focus
  sage: "#457565", // retention, success, calm progress
  copper: "#A6673F", // sparse warmth, milestones, never body text
  mist: "#DDE5E1", // dividers and disabled surfaces
  warning: "#A46A19",
  error: "#B44444",
} as const;

/**
 * Text-safe variants.
 *
 * Measured against WCAG 2.2: `warning` (4.25:1 on paper) and `copper`
 * (4.27:1 on paper) do NOT reach AA for normal-size body text. They remain
 * valid as fills, borders, and large accents. Use these darkened variants
 * wherever the colour carries text. See docs/04-design-system.md for the
 * full measured pairing matrix.
 */
export const textColorTokens = {
  warningText: "#8A5814", // 5.68:1 on paper, 5.50:1 on canvas
  copperText: "#8A5433", // 5.83:1 on paper, 5.64:1 on canvas
} as const;

export const motionTokens = {
  /** ms. All motion must respect prefers-reduced-motion. */
  microFeedback: 120,
  stateChange: 180,
  pageTransition: 240,
} as const;

export const layoutTokens = {
  spacingGridPx: 4,
  defaultRadiusPx: 12,
  minTouchTargetPx: 44,
} as const;

export const typography = {
  latinUi: "Manrope",
  arabicUi: "IBM Plex Sans Arabic",
  /** Reserved exclusively for verified Qur'anic text. */
  quranic: "Amiri Quran",
} as const;
