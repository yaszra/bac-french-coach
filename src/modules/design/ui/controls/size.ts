import type { Tier } from "../../theme/tier";

/** Every Marginalia control uses the same three steps. */
export type ControlSize = "sm" | "md" | "lg";

const KIDS_BUMP: Readonly<Record<ControlSize, ControlSize>> = { sm: "md", md: "lg", lg: "lg" };

/**
 * Children get bigger controls without any screen asking for them: the tier is
 * resolved server-side, and the tap tokens (--tap-min 44 → 56) grow with it.
 */
export function resolveControlSize(size: ControlSize, tier: Tier): ControlSize {
  return tier === "kids" ? KIDS_BUMP[size] : size;
}
