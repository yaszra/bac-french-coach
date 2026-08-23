/**
 * Bilingual catalogue integrity.
 *
 * English and Arabic are built together; these tests make "we'll translate
 * it later" impossible to ship rather than merely discouraged.
 */
import { describe, expect, it } from "vitest";
import {
  LOCALES,
  catalogues,
  directionOf,
  translate,
  type MessageKey,
} from "../../src/ui/i18n/messages.js";
import { containsArabicScript } from "../../src/content/tripwire.js";

const keys = Object.keys(catalogues.en) as MessageKey[];

describe("both catalogues are complete", () => {
  it("covers every key in every locale", () => {
    for (const locale of LOCALES) {
      const missing = keys.filter((k) => !catalogues[locale][k]);
      expect(missing, `${locale} is missing keys`).toEqual([]);
    }
  });

  it("has no empty strings", () => {
    for (const locale of LOCALES)
      for (const key of keys)
        expect(catalogues[locale][key].trim().length, `${locale}.${key}`).toBeGreaterThan(0);
  });

  it("leaves no English string sitting in the Arabic catalogue", () => {
    // A copy-paste placeholder is the usual way a half-translated screen
    // ships. Brand and product names are the legitimate exception.
    const exempt = new Set<MessageKey>([]);
    for (const key of keys) {
      if (exempt.has(key)) continue;
      if (catalogues.en[key] === catalogues.ar[key])
        throw new Error(`ar.${key} is identical to English: "${catalogues.en[key]}"`);
    }
  });

  it("keeps every placeholder from the English string in the Arabic one", () => {
    const placeholders = (s: string) =>
      new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!));
    for (const key of keys) {
      const en = placeholders(catalogues.en[key]);
      const ar = placeholders(catalogues.ar[key]);
      expect([...en].filter((p) => !ar.has(p)), `ar.${key}`).toEqual([]);
      expect([...ar].filter((p) => !en.has(p)), `ar.${key}`).toEqual([]);
    }
  });
});

describe("interpolation", () => {
  it("substitutes named values", () => {
    expect(translate("en", "today.activeMinutes", { minutes: 9 })).toBe(
      "9 minutes of active practice",
    );
  });

  it("leaves a missing value visible rather than silently blanking it", () => {
    // A sentence that reads as complete but says less than it should is
    // worse than one that visibly needs fixing.
    expect(translate("en", "today.activeMinutes")).toContain("{minutes}");
  });

  it("interpolates into Arabic identically", () => {
    expect(translate("ar", "session.listenCount", { done: 2, required: 3 })).toContain("2");
    expect(translate("ar", "session.listenCount", { done: 2, required: 3 })).toContain("3");
  });
});

describe("direction is derived, never set by hand", () => {
  it("maps locale to direction", () => {
    expect(directionOf("en")).toBe("ltr");
    expect(directionOf("ar")).toBe("rtl");
  });
});

describe("the catalogue holds interface copy, never scripture", () => {
  it("contains Arabic script only in the Arabic catalogue", () => {
    for (const key of keys)
      expect(containsArabicScript(catalogues.en[key]), `en.${key}`).toBe(false);
  });

  it("keeps every Arabic string short enough to be UI copy, not an ayah", () => {
    // A crude but effective guard: interface strings are short. A long
    // Arabic run in this file would be the signature of pasted content.
    for (const key of keys)
      expect(catalogues.ar[key].length, `ar.${key} is unusually long`).toBeLessThan(120);
  });

  it("never uses the Qur'anic typeface for interface copy", async () => {
    const { typography } = await import("../../src/config/brand.js");
    const { tokenStylesheet } = await import("../../src/ui/tokens.js");
    const sheet = tokenStylesheet();
    // The Qur'anic face is declared as a token but must not be bound to
    // any element rule in the sheet.
    expect(sheet).toContain(`--athar-font-quran: "${typography.quranic}"`);
    expect(sheet).not.toMatch(new RegExp(`font-family:[^;]*${typography.quranic}`));
  });
});
