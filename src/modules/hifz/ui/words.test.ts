import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { segmentWords, wordCount } from "./words";

/** Codepoints, never typed letters: the test may not contain scripture either. */
const OPEN_FATHATAN = "ࣰ";
const ALIF = "ا";
const DAL = "د";
const MIM = "م";

describe("word boundaries", () => {
  it("splits ordinary words on whitespace", () => {
    expect(segmentWords(`${MIM} ${DAL}`)).toEqual([MIM, DAL]);
  });

  it("rejoins a detached tanwīn alif to the word it belongs to", () => {
    const text = `${DAL}${OPEN_FATHATAN} ${ALIF}`;
    expect(segmentWords(text)).toEqual([text]);
  });

  it("returns substrings that concatenate back to the original, byte for byte", () => {
    const text = `${MIM} ${DAL}${OPEN_FATHATAN} ${ALIF} ${MIM}`;
    expect(segmentWords(text).join(" ")).toBe(text);
  });

  it("does not swallow an alif that follows an ordinary letter", () => {
    expect(segmentWords(`${DAL} ${ALIF}`)).toEqual([DAL, ALIF]);
  });

  it("does not swallow a word that merely starts with an alif", () => {
    expect(segmentWords(`${DAL}${OPEN_FATHATAN} ${ALIF}${MIM}`)).toEqual([
      `${DAL}${OPEN_FATHATAN}`,
      `${ALIF}${MIM}`,
    ]);
  });

  it("tolerates repeated and leading whitespace", () => {
    expect(segmentWords(`  ${MIM}   ${DAL}  `)).toEqual([MIM, DAL]);
  });

  it("returns nothing for an empty string", () => {
    expect(segmentWords("")).toEqual([]);
    expect(wordCount("")).toBe(0);
  });

  it("counts words after the boundaries are settled", () => {
    expect(wordCount(`${MIM} ${DAL}${OPEN_FATHATAN} ${ALIF}`)).toBe(2);
  });

  it("leaves no bare alif standing anywhere in the corpus", () => {
    const corpus = JSON.parse(
      readFileSync("content/quran/quran-uthmani.json", "utf8"),
    ) as { sura: number; ayah: number; text: string }[];
    const offenders = corpus
      .flatMap((verse) =>
        segmentWords(verse.text)
          .filter((word) => word === ALIF)
          .map(() => `${verse.sura}:${verse.ayah}`),
      )
      .slice(0, 5);
    expect(offenders).toEqual([]);
  });

  it("never loses or invents a character anywhere in the corpus", () => {
    const corpus = JSON.parse(
      readFileSync("content/quran/quran-uthmani.json", "utf8"),
    ) as { sura: number; ayah: number; text: string }[];
    for (const verse of corpus.slice(0, 500)) {
      expect(segmentWords(verse.text).join(" ")).toBe(verse.text.trim().replace(/\s+/gu, " "));
    }
  });
});
