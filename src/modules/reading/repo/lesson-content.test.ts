import { describe, expect, it } from "vitest";

import { conceptById } from "../domain/concepts";
import type { LessonSummary } from "../ui/path-shape";
import {
  conceptIdsOfElement,
  qaidahLesson,
  qaidahLessons,
  qaidahLexicon,
  narrationFor,
  withPrerequisiteFoundations,
} from "./lesson-content";

describe("lesson elements are joined to the lattice by codepoint, not by name", () => {
  it("resolves a letter whose lesson name differs from its Unicode name", () => {
    // The lesson calls it `letter.baa`; the lattice calls it `letter.beh`.
    expect(conceptIdsOfElement({ conceptId: "letter.baa", letter: "ب" })).toEqual(["letter.beh"]);
  });

  it("resolves a letter carrying a vowel", () => {
    expect(conceptIdsOfElement({ conceptId: "letter_harakah.alif.fathah", letter: "ا", harakah: "َ" })).toEqual(
      ["letter.alef.fathah"],
    );
  });

  it("resolves only the positions a letter actually takes", () => {
    // ʾalif never joins forward, so it has no initial or medial shape to teach.
    const forms = conceptIdsOfElement({
      conceptId: "form.alif",
      letter: "ا",
      forms: ["isolated", "initial", "medial", "final"],
    });
    expect(forms).toEqual(["form.alef.isolated", "form.alef.final"]);
  });

  it("resolves all four positions for a letter that takes them", () => {
    expect(
      conceptIdsOfElement({
        conceptId: "form.baa",
        letter: "ب",
        forms: ["isolated", "initial", "medial", "final"],
      }),
    ).toHaveLength(4);
  });

  it("passes marks, tanwīn and madd through by their own ids", () => {
    expect(conceptIdsOfElement({ conceptId: "sukun", mark: "ْ" })).toEqual(["sukun"]);
    expect(conceptIdsOfElement({ conceptId: "tanwin.fath", mark: "ً" })).toEqual(["tanwin.fath"]);
    expect(conceptIdsOfElement({ conceptId: "madd.tabii", letters: ["ا", "و", "ي"] })).toEqual(["madd.tabii"]);
  });

  it("resolves nothing rather than guessing at an unknown element", () => {
    expect(conceptIdsOfElement({ conceptId: "letter.nonesuch" })).toEqual([]);
    expect(conceptIdsOfElement({ conceptId: "letter.x", letter: "A" })).toEqual([]);
    expect(conceptIdsOfElement({ conceptId: "x", letter: "ب", harakah: "A" })).toEqual([]);
  });
});

describe("the installed lesson package", () => {
  const lessons = qaidahLessons();

  it("loads all twelve lessons in teaching order", () => {
    expect(lessons.length).toBe(12);
    expect(lessons.map((lesson) => lesson.order)).toEqual([...lessons.map((l) => l.order)].sort((a, b) => a - b));
  });

  it("resolves every element it contains", () => {
    for (const lesson of lessons) {
      expect(lesson.unresolvedElements, lesson.id).toBe(0);
    }
  });

  it("teaches all twenty-eight letters across the four letter lessons", () => {
    const letters = new Set(
      lessons
        .filter((lesson) => lesson.kind === "letter")
        .flatMap((lesson) => lesson.conceptIds)
        .filter((id) => conceptById(id)?.kind === "letter"),
    );
    expect(letters.size).toBe(28);
  });

  it("names concepts the lattice actually has", () => {
    for (const lesson of lessons) {
      for (const conceptId of lesson.conceptIds) {
        expect(conceptById(conceptId), `${lesson.id}: ${conceptId}`).not.toBeNull();
      }
    }
  });

  it("gives every lesson a message key rather than a title", () => {
    for (const lesson of lessons) {
      expect(lesson.titleKey).toMatch(/^reading\.lesson\./);
    }
  });

  it("finds one lesson by id, and nothing for an id it does not have", () => {
    expect(qaidahLesson("letters.group1")?.order).toBe(1);
    expect(qaidahLesson("letters.group99")).toBeNull();
  });
});

describe("foundations a lesson depends on but does not list", () => {
  it("attaches an unlisted prerequisite to the first lesson that needs it", () => {
    const lessons: readonly LessonSummary[] = [
      {
        id: "vowels",
        order: 1,
        kind: "letter_harakah",
        titleKey: "reading.lesson.vowels",
        prerequisites: [],
        conceptIds: ["letter.alef.fathah"],
      },
    ];
    const [augmented] = withPrerequisiteFoundations(lessons);
    expect(augmented?.conceptIds).toContain("harakah.fathah");
    expect(augmented?.conceptIds).toContain("letter.alef");
  });

  it("attaches it once, to the earliest lesson only", () => {
    const lessons: readonly LessonSummary[] = [
      {
        id: "a",
        order: 1,
        kind: "letter_harakah",
        titleKey: "reading.lesson.a",
        prerequisites: [],
        conceptIds: ["letter.alef.fathah"],
      },
      {
        id: "b",
        order: 2,
        kind: "letter_harakah",
        titleKey: "reading.lesson.b",
        prerequisites: ["a"],
        conceptIds: ["letter.beh.fathah"],
      },
    ];
    const augmented = withPrerequisiteFoundations(lessons);
    expect(augmented[0]?.conceptIds).toContain("harakah.fathah");
    expect(augmented[1]?.conceptIds).not.toContain("harakah.fathah");
  });

  it("leaves a lesson whose prerequisites are all taught untouched", () => {
    const lessons: readonly LessonSummary[] = [
      {
        id: "letters",
        order: 1,
        kind: "letter",
        titleKey: "reading.lesson.letters",
        prerequisites: [],
        conceptIds: ["letter.beh"],
      },
    ];
    expect(withPrerequisiteFoundations(lessons)[0]?.conceptIds).toEqual(["letter.beh"]);
  });

  it("leaves no concept in the installed package standing on an untaught prerequisite", () => {
    const taught = new Set(qaidahLessons().flatMap((lesson) => lesson.conceptIds));
    for (const conceptId of taught) {
      for (const prerequisite of conceptById(conceptId)?.prerequisites ?? []) {
        expect(taught.has(prerequisite), `${conceptId} ← ${prerequisite}`).toBe(true);
      }
    }
  });
});

describe("narration and the lexicon", () => {
  it("loads the lexicon of terms narration may speak", () => {
    expect(qaidahLexicon().length).toBeGreaterThan(0);
  });

  it("carries only single terms, never a phrase", () => {
    for (const term of qaidahLexicon()) {
      expect(term.ar.trim().includes(" "), term.id).toBe(false);
    }
  });

  it("loads a narration manifest whose prose is English", () => {
    const manifest = narrationFor("letters.group1");
    expect(manifest).not.toBeNull();
    for (const segment of manifest?.segments ?? []) {
      expect(/[؀-ۿ]/u.test(segment.en), segment.id).toBe(false);
    }
  });

  it("returns nothing for a lesson with no narration, rather than inventing some", () => {
    expect(narrationFor("madd.tabii")).toBeNull();
  });

  it("names only terms the lexicon carries", () => {
    const known = new Set(qaidahLexicon().map((term) => term.ar));
    for (const segment of narrationFor("letters.group1")?.segments ?? []) {
      for (const term of segment.terms) expect(known.has(term), term).toBe(true);
    }
  });
});
