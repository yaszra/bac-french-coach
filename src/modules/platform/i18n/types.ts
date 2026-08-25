/**
 * Typed message keys. Components never contain literal user-facing strings —
 * a lint rule and a review gate enforce it. Every key must exist in BOTH
 * messages/en.json and messages/ar.json (proven by a unit test).
 */
import type { EN } from "../../../../messages";

export type Messages = typeof EN;
export type MessageKey = keyof Messages;

export type Locale = "en" | "ar";
export const LOCALES = ["en", "ar"] as const;
export const DEFAULT_LOCALE: Locale = "en";

export function directionOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Interpolation params. Values are escaped by React; never build HTML here. */
export type MessageParams = Record<string, string | number>;

/**
 * Arabic has six plural forms; English has two. Plural-bearing keys are stored
 * as objects keyed by CLDR category, e.g. { one: "…", other: "…" }.
 */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";
export type PluralMessage = Partial<Record<PluralCategory, string>>;
