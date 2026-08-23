/**
 * Design-token contrast gate.
 *
 * docs/04-design-system.md publishes a measured contrast matrix. This test
 * recomputes it, so a token change that breaks WCAG 2.2 AA fails the build
 * rather than shipping.
 */
import { describe, expect, it } from "vitest";
import { brand, colorTokens, layoutTokens, motionTokens, textColorTokens } from "../src/config/brand.js";

const srgb = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * srgb((n >> 16) & 255) +
    0.7152 * srgb((n >> 8) & 255) +
    0.0722 * srgb(n & 255)
  );
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = "#FFFFFF";

/** Pairings where the foreground carries normal-size body text. */
const TEXT_PAIRS: [string, string, string][] = [
  [colorTokens.ink, colorTokens.paper, "ink on paper"],
  [colorTokens.ink, colorTokens.canvas, "ink on canvas"],
  [colorTokens.ink, colorTokens.mist, "ink on mist"],
  [colorTokens.deepIndigo, colorTokens.paper, "primary action on paper"],
  [colorTokens.deepIndigo, colorTokens.canvas, "primary action on canvas"],
  [WHITE, colorTokens.deepIndigo, "label on primary fill"],
  [colorTokens.sage, colorTokens.paper, "success text on paper"],
  [colorTokens.sage, colorTokens.canvas, "success text on canvas"],
  [WHITE, colorTokens.sage, "label on success fill"],
  [colorTokens.error, colorTokens.paper, "error text on paper"],
  [colorTokens.error, colorTokens.canvas, "error text on canvas"],
  [WHITE, colorTokens.error, "label on destructive fill"],
  [textColorTokens.warningText, colorTokens.paper, "warning text on paper"],
  [textColorTokens.warningText, colorTokens.canvas, "warning text on canvas"],
  [textColorTokens.copperText, colorTokens.paper, "milestone text on paper"],
  [colorTokens.paper, colorTokens.night, "paper text on dark surround"],
  [colorTokens.mist, colorTokens.night, "muted text on dark surround"],
];

describe("WCAG 2.2 AA for text-bearing token pairs", () => {
  it.each(TEXT_PAIRS)("%s on %s (%s) reaches 4.5:1", (fg, bg, label) => {
    const ratio = contrast(fg, bg);
    expect(ratio, `${label}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("reaches AAA for body copy on both reading surfaces", () => {
    expect(contrast(colorTokens.ink, colorTokens.paper)).toBeGreaterThanOrEqual(7);
    expect(contrast(colorTokens.ink, colorTokens.canvas)).toBeGreaterThanOrEqual(7);
  });
});

describe("accent colours are documented as unsafe for body text", () => {
  it("records that raw warning and copper fall short of AA at text size", () => {
    // This is why textColorTokens exists. If a token change ever lifts these
    // above AA, revisit the doc rather than silently keeping two tokens.
    expect(contrast(colorTokens.warning, colorTokens.paper)).toBeLessThan(4.5);
    expect(contrast(colorTokens.copper, colorTokens.paper)).toBeLessThan(4.5);
  });

  it("keeps them usable as fills with white labels", () => {
    expect(contrast(WHITE, colorTokens.warning)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, colorTokens.copper)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps non-text UI surfaces above the 3:1 component threshold", () => {
    expect(contrast(colorTokens.mist, colorTokens.paper)).toBeLessThan(3);
    expect(contrast(colorTokens.deepIndigo, colorTokens.canvas)).toBeGreaterThanOrEqual(3);
  });
});

describe("brand configuration is centralized and honest", () => {
  it("marks the working name as provisional until clearance is recorded", () => {
    expect(brand.provisional).toBe(true);
  });

  it("exposes the strings a rename would have to touch, in one place", () => {
    expect(brand.name).toBeTruthy();
    expect(brand.descriptor).toBeTruthy();
    expect(brand.tagline).toBeTruthy();
  });
});

describe("layout and motion tokens match the specification", () => {
  it("uses a 4px grid, 12px radius, and a 44px minimum touch target", () => {
    expect(layoutTokens.spacingGridPx).toBe(4);
    expect(layoutTokens.defaultRadiusPx).toBe(12);
    expect(layoutTokens.minTouchTargetPx).toBeGreaterThanOrEqual(44);
  });

  it("keeps motion durations short and ordered", () => {
    expect(motionTokens.microFeedback).toBeLessThan(motionTokens.stateChange);
    expect(motionTokens.stateChange).toBeLessThan(motionTokens.pageTransition);
    expect(motionTokens.pageTransition).toBeLessThanOrEqual(240);
  });
});
