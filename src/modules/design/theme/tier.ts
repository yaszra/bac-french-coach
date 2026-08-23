/**
 * Tier is resolved SERVER-SIDE from the account (set by an adult for children),
 * stamped on the document, and it changes surface and copy — never the text of
 * the Qurʾān and never what counts as evidence.
 */
export type Tier = "kids" | "teen" | "adult";
export type Theme = "light" | "dark";

export const TIERS = ["kids", "teen", "adult"] as const;
export const THEMES = ["light", "dark"] as const;

/** Age → tier. Guardians may override downward, never upward past the account age. */
export function tierForAge(age: number): Tier {
  if (age <= 8) return "kids";
  if (age <= 15) return "teen";
  return "adult";
}

export type TierPolicy = {
  /** Kids are guided-only: nothing self-assigned, nothing configurable. */
  readonly guidedOnly: boolean;
  readonly maxSessionMinutes: number;
  readonly showsStreak: boolean;
  readonly showsScores: boolean;
  readonly allowsTextInput: boolean;
  readonly allowsSettings: boolean;
  readonly spokenPrompts: boolean;
  readonly navItems: number;
};

export const TIER_POLICY: Readonly<Record<Tier, TierPolicy>> = {
  kids: {
    guidedOnly: true,
    maxSessionMinutes: 10,
    showsStreak: false,
    showsScores: false,
    allowsTextInput: false,
    allowsSettings: false,
    spokenPrompts: true,
    navItems: 3,
  },
  teen: {
    guidedOnly: false,
    maxSessionMinutes: 25,
    showsStreak: true,
    showsScores: false,
    allowsTextInput: true,
    allowsSettings: true,
    spokenPrompts: false,
    navItems: 5,
  },
  adult: {
    guidedOnly: false,
    maxSessionMinutes: 45,
    showsStreak: false,
    showsScores: false,
    allowsTextInput: true,
    allowsSettings: true,
    spokenPrompts: false,
    navItems: 5,
  },
};

export function policyFor(tier: Tier): TierPolicy {
  return TIER_POLICY[tier];
}
