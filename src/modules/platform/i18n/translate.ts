import { type Locale, type MessageParams, type PluralCategory, DEFAULT_LOCALE } from "./types";
import { EN, AR } from "../../../../messages";

type Bundle = Record<string, unknown>;
const BUNDLES: Record<Locale, Bundle> = { en: EN as Bundle, ar: AR as Bundle };

function lookup(bundle: Bundle, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in (node as Bundle)) {
      return (node as Bundle)[part];
    }
    return undefined;
  }, bundle);
}

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

function pluralCategory(locale: Locale, count: number): PluralCategory {
  return new Intl.PluralRules(locale).select(count) as PluralCategory;
}

/**
 * Resolve a message key. Missing keys return the key itself — visible in
 * development and in tests, never a silent empty string (honesty rule).
 */
export function translate(locale: Locale, key: string, params?: MessageParams): string {
  const node = lookup(BUNDLES[locale], key) ?? lookup(BUNDLES[DEFAULT_LOCALE], key);
  if (typeof node === "string") return interpolate(node, params);
  if (node && typeof node === "object" && params && typeof params.count === "number") {
    const forms = node as Partial<Record<PluralCategory, string>>;
    const form = forms[pluralCategory(locale, params.count)] ?? forms.other;
    if (typeof form === "string") return interpolate(form, params);
  }
  return key;
}

export function translator(locale: Locale) {
  return (key: string, params?: MessageParams) => translate(locale, key, params);
}
export type Translate = ReturnType<typeof translator>;
