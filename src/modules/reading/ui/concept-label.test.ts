import { describe, expect, it } from "vitest";

import { translate } from "@/modules/platform/i18n/translate";
import type { Locale } from "@/modules/platform/i18n/types";

import { ARABIC_ALPHABET, MAKHARIJ, MAKHRAJ_REGIONS } from "../domain/concepts";
import { conceptGlyph, conceptLabel, makhrajLabel, regionLabel } from "./concept-label";
import { articulationPoint, makhrajRegions, placeOfLetter } from "./makhraj-view";

const t = (locale: Locale) => (key: string, params?: Record<string, string | number>) =>
  translate(locale, key, params);

describe("every concept a screen can show has a name in both languages", () => {
  it("names all twenty-eight letters, in English and Arabic", () => {
    for (const letter of ARABIC_ALPHABET) {
      for (const locale of ["en", "ar"] as const) {
        const label = conceptLabel(t(locale), letter.id);
        expect(label, `${letter.id} (${locale})`).not.toBe(`reading.concept.${letter.id}`);
        expect(label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("names hamzah, which is not one of the twenty-eight", () => {
    expect(conceptLabel(t("en"), "letter.hamza")).toBe("hamzah");
  });

  it("composes a letter carrying a vowel rather than authoring a key per pair", () => {
    expect(conceptLabel(t("en"), "letter.beh.fathah")).toContain("bāʾ");
    expect(conceptLabel(t("en"), "letter.beh.fathah")).toContain("fatḥah");
    expect(conceptLabel(t("ar"), "letter.beh.fathah")).toContain("الباء");
  });

  it("composes a letter in a position", () => {
    expect(conceptLabel(t("en"), "form.beh.initial")).toContain("bāʾ");
    expect(conceptLabel(t("en"), "form.beh.initial")).toContain("beginning");
  });

  it("names the marks and the tajwīd rules", () => {
    expect(conceptLabel(t("en"), "sukun")).toBe("sukūn");
    expect(conceptLabel(t("en"), "tanwin.fath")).toContain("tanwīn");
    expect(conceptLabel(t("ar"), "rule.qalqalah")).toBe("القلقلة");
  });

  it("returns a key, not a confident guess, for an id this build has never heard of", () => {
    expect(conceptLabel(t("en"), "letter.nonesuch")).toBe("reading.concept.letter.nonesuch");
  });

  it("names all seventeen makhārij and all five regions in both languages", () => {
    for (const locale of ["en", "ar"] as const) {
      for (const definition of MAKHARIJ) {
        expect(makhrajLabel(t(locale), definition.id)).not.toBe(definition.labelKey);
      }
      for (const region of MAKHRAJ_REGIONS) {
        expect(regionLabel(t(locale), region)).not.toBe(`reading.region.${region}`);
      }
    }
  });
});

describe("glyphs are teaching data, never composed text", () => {
  it("returns a single letter for a letter concept", () => {
    expect([...conceptGlyph("letter.beh")].length).toBe(1);
  });

  it("returns a letter and one mark for a letter carrying a vowel", () => {
    expect([...conceptGlyph("letter.beh.fathah")].length).toBe(2);
  });

  it("never returns anything long enough to be a word", () => {
    for (const letter of ARABIC_ALPHABET) {
      expect([...conceptGlyph(letter.id)].length).toBeLessThanOrEqual(2);
    }
  });

  it("returns nothing for a concept that shows no codepoints", () => {
    expect(conceptGlyph("letter.nonesuch")).toBe("");
  });
});

describe("the alphabet arranged by where it is made", () => {
  const regions = makhrajRegions();

  it("has all five regions, deepest first", () => {
    expect(regions.map((region) => region.region)).toEqual([...MAKHRAJ_REGIONS]);
  });

  it("accounts for all seventeen places without dropping the empty ones", () => {
    expect(regions.reduce((total, region) => total + region.places.length, 0)).toBe(MAKHARIJ.length);
  });

  it("places every letter exactly once", () => {
    const placed = regions.flatMap((region) => region.places.flatMap((place) => place.letters));
    expect(placed.length).toBe(ARABIC_ALPHABET.length + 1); // the alphabet plus hamzah
    expect(new Set(placed.map((letter) => letter.id)).size).toBe(placed.length);
  });

  it("carries each region's own denominator", () => {
    for (const region of regions) {
      const counted = region.places.reduce((total, place) => total + place.letters.length, 0);
      expect(region.letterCount).toBe(counted);
    }
  });

  it("finds the place of a letter", () => {
    const beh = ARABIC_ALPHABET.find((letter) => letter.name === "beh");
    expect(placeOfLetter(beh ?? ARABIC_ALPHABET[0]!)?.id).toBe(beh?.makhraj);
  });

  it("keeps every articulation point inside the drawing", () => {
    for (const definition of MAKHARIJ) {
      const point = articulationPoint(definition.id);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
  });

  it("puts the lips further forward than the throat", () => {
    expect(articulationPoint("makhraj.shafatan.shafatayn").x).toBeGreaterThan(
      articulationPoint("makhraj.halq.aqsa").x,
    );
  });
});
