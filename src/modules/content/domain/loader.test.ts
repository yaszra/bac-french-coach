import { describe, expect, it, beforeEach } from "vitest";
import { contentState, getAyah, getAyahRange, getPage, pageOf, wordsOf, resetContentCache } from "./loader";

beforeEach(() => resetContentCache());

describe("the content loader", () => {
  it("reports that the package is loaded", () => {
    expect(contentState()).toEqual({ kind: "loaded" });
  });

  it("returns an āyah by reference", () => {
    const verse = getAyah(1, 1);
    expect(verse).not.toBeNull();
    expect(verse?.sura).toBe(1);
    expect(verse?.text.length).toBeGreaterThan(0);
  });

  it("returns null for an āyah that does not exist, rather than a placeholder", () => {
    expect(getAyah(1, 8)).toBeNull();
    expect(getAyah(115, 1)).toBeNull();
  });

  it("hands back frozen objects, so nothing downstream can edit the muṣḥaf", () => {
    const verse = getAyah(2, 255);
    expect(Object.isFrozen(verse)).toBe(true);
    expect(() => {
      // @ts-expect-error deliberately attempting a mutation the type forbids
      verse.text = "changed";
    }).toThrow();
    expect(getAyah(2, 255)?.text).toBe(verse?.text);
  });

  it("resolves a page's references against the corpus", () => {
    const page = getPage(1);
    expect(page?.ranges).toEqual([{ sura: 1, ayahFrom: 1, ayahTo: 7 }]);
    expect(page?.ayahs).toHaveLength(7);
  });

  it("resolves a page that spans more than one sūrah", () => {
    const page = getPage(604);
    expect(page?.ranges.map((r) => r.sura)).toEqual([112, 113, 114]);
    expect(page?.ayahs).toHaveLength(4 + 5 + 6);
  });

  it("reports line breaks as not yet recorded rather than inventing them", () => {
    expect(getPage(1)?.lines).toBe("not_yet_recorded");
  });

  it("finds the page an āyah sits on", () => {
    expect(pageOf(1, 1)).toBe(1);
    expect(pageOf(2, 142)).toBe(22);
    expect(pageOf(78, 1)).toBe(582);
  });

  it("splits an āyah into words for word-level exercises", () => {
    const words = wordsOf(1, 1);
    expect(words.length).toBeGreaterThan(2);
    expect(words.every((word) => word.trim() === word && word.length > 0)).toBe(true);
  });

  it("returns an empty range rather than throwing when a range runs off the end", () => {
    expect(getAyahRange(114, 1, 99)).toHaveLength(6);
  });
});
