import { describe, expect, it } from "vitest";
import { PACKED_WORDS_PER_LINE, buildPageModel, hideForScaffold } from "./page-model";

const AYAH = { ayah: 1, words: ["a", "b", "c", "d", "e", "f", "g", "h"], depth: 3 as const };

describe("the page model", () => {
  it("keeps every word the caller gave it, in order", () => {
    const model = buildPageModel({ ayahs: [AYAH] });
    expect(model.lines.flatMap((line) => line.words.map((w) => w.text))).toEqual(AYAH.words);
  });

  it("packs lines at the declared width", () => {
    const model = buildPageModel({ ayahs: [AYAH] });
    expect(model.lines[0]?.words).toHaveLength(PACKED_WORDS_PER_LINE);
    expect(model.lines[1]?.words).toHaveLength(1);
  });

  it("admits that packed lines are not measured muṣḥaf lines", () => {
    expect(buildPageModel({ ayahs: [AYAH] }).linesAreMeasured).toBe(false);
  });

  it("says lines are measured when the layout supplies them", () => {
    expect(buildPageModel({ ayahs: [AYAH], measuredLines: [[1, 2]] }).linesAreMeasured).toBe(true);
  });

  it("numbers words from 1 within their āyah", () => {
    const model = buildPageModel({ ayahs: [{ ayah: 4, words: ["x", "y"], depth: 1 }] });
    expect(model.lines[0]?.words.map((w) => w.index)).toEqual([1, 2]);
    expect(model.lines[0]?.words.map((w) => w.ayah)).toEqual([4, 4]);
  });

  it("marks the last word of each āyah so the rosette lands right", () => {
    const model = buildPageModel({
      ayahs: [
        { ayah: 1, words: ["a", "b"], depth: 2 },
        { ayah: 2, words: ["c"], depth: 2 },
      ],
    });
    const words = model.lines.flatMap((line) => line.words);
    expect(words.map((w) => w.endsAyah === true)).toEqual([false, true, true]);
  });

  it("gives every word of an āyah the āyah's depth", () => {
    const model = buildPageModel({ ayahs: [AYAH] });
    expect(model.lines.flatMap((l) => l.words).every((w) => w.depth === 3)).toBe(true);
  });

  it("applies word states by address", () => {
    const model = buildPageModel({
      ayahs: [AYAH],
      wordStates: new Map([["1:2", "active" as const]]),
    });
    const words = model.lines.flatMap((l) => l.words);
    expect(words[1]?.state).toBe("active");
    expect(words[0]?.state).toBeUndefined();
  });

  it("reveals only the words the scaffold names", () => {
    const model = buildPageModel({ ayahs: [AYAH], revealed: new Set(["1:1"]) });
    const words = model.lines.flatMap((l) => l.words);
    expect(words[0]?.revealed).toBe(true);
    expect(words[1]?.revealed).toBeUndefined();
  });

  it("counts the words it laid out", () => {
    expect(buildPageModel({ ayahs: [AYAH] }).wordCount).toBe(8);
  });

  it("produces no lines for no āyāt, rather than an empty line", () => {
    const model = buildPageModel({ ayahs: [] });
    expect(model.lines).toEqual([]);
    expect(model.wordCount).toBe(0);
  });

  it("takes every word's space away from nobody when hiding for a scaffold", () => {
    const hidden = hideForScaffold([AYAH]);
    expect(hidden[0]?.words).toEqual(AYAH.words);
    expect(hidden[0]?.depth).toBe(0);
  });

  it("refuses a line width below one instead of looping forever", () => {
    const model = buildPageModel({ ayahs: [AYAH], wordsPerLine: 0 });
    expect(model.lines).toHaveLength(8);
  });
});

describe("revealing for a scaffold", () => {
  it("reveals every word when the scaffold says so", () => {
    const model = buildPageModel({ ayahs: [{ ayah: 1, words: ["a", "b"], depth: 0 }], revealAll: true });
    expect(model.lines[0]?.words.every((w) => w.revealed === true)).toBe(true);
  });

  it("leaves what was earned alone while revealing it", () => {
    const model = buildPageModel({ ayahs: [{ ayah: 1, words: ["a"], depth: 0 }], revealAll: true });
    expect(model.lines[0]?.words[0]?.depth).toBe(0);
  });

  it("reveals nothing by default", () => {
    const model = buildPageModel({ ayahs: [{ ayah: 1, words: ["a"], depth: 0 }] });
    expect(model.lines[0]?.words[0]?.revealed).toBeUndefined();
  });

  it("still honours a named reveal when revealAll is off", () => {
    const model = buildPageModel({
      ayahs: [{ ayah: 1, words: ["a", "b"], depth: 0 }],
      revealAll: false,
      revealed: new Set(["1:2"]),
    });
    expect(model.lines[0]?.words[1]?.revealed).toBe(true);
  });
});
