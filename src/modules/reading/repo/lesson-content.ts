/**
 * The Qāʿidah lesson package.
 *
 * `content/qaidah/` is authored content: twelve lessons, a lexicon of terms narration
 * may speak, and narration manifests. It is read-only at runtime and it is loaded
 * once.
 *
 * ## Two id vocabularies, joined by codepoint
 *
 * The lesson files name concepts the way a teacher would (`letter.baa`); the lattice
 * names them by Unicode character name (`letter.beh`), because transliterations
 * collide and Unicode names do not. Rather than rewrite either, the join is made on
 * the thing that cannot be ambiguous: the codepoint itself. A lesson element that
 * does not resolve is dropped and *counted* — a lesson silently teaching fewer
 * concepts than it claims would be exactly the kind of quiet inaccuracy the honesty
 * rule exists to prevent.
 *
 * ## Sacred-content rule
 *
 * Lesson files legitimately carry single letters and letter+ḥarakah combinations —
 * they are the alphabet being taught, and `verify_qaidah.mjs` proves nothing longer
 * ever appears. This module reads them, resolves them to concept ids, and passes
 * *references* onward. No Arabic string is composed, extended or generated here.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import {
  ARABIC_LETTERS,
  HARAKAT,
  conceptById,
  formConceptId,
  letterHarakahConceptId,
  type ConceptId,
  type HarakahId,
  type LetterForm,
} from "../domain/concepts";
import type { LessonSummary } from "../ui/path-shape";

const CONTENT_ROOT = path.join(process.cwd(), "content", "qaidah");
const LESSON_DIR = path.join(CONTENT_ROOT, "lessons");
const LEXICON_PATH = path.join(CONTENT_ROOT, "lexicon.json");
const NARRATION_DIR = path.join(CONTENT_ROOT, "narration");

const lessonElementSchema = z.object({
  conceptId: z.string().min(1),
  letter: z.string().optional(),
  harakah: z.string().optional(),
  mark: z.string().optional(),
  letters: z.array(z.string()).optional(),
  forms: z.array(z.string()).optional(),
  translit: z.string().optional(),
  sound: z.string().optional(),
});

const lessonFileSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(1),
  kind: z.string().min(1),
  titleKey: z.string().min(1),
  prerequisites: z.array(z.string()),
  elements: z.array(lessonElementSchema).min(1),
  activities: z.array(z.string()).default([]),
  narration: z.object({ manifestId: z.string() }).optional(),
  talqin: z.object({ required: z.boolean() }).partial().optional(),
});

export type LessonElement = z.infer<typeof lessonElementSchema>;
export type LessonFile = z.infer<typeof lessonFileSchema>;

const narrationSegmentSchema = z.object({
  id: z.string().min(1),
  en: z.string().min(1),
  terms: z.array(z.string()).default([]),
});

const narrationSchema = z.object({
  id: z.string().min(1),
  lessonId: z.string().min(1),
  voice: z.string().min(1),
  segments: z.array(narrationSegmentSchema),
});

export type NarrationSegment = z.infer<typeof narrationSegmentSchema>;
export type NarrationManifest = z.infer<typeof narrationSchema>;

const lexiconSchema = z.object({
  terms: z.array(
    z.object({
      id: z.string().min(1),
      ar: z.string().min(1),
      translit: z.string().min(1),
      gloss: z.string().min(1),
    }),
  ),
});

export type LexiconTerm = z.infer<typeof lexiconSchema>["terms"][number];

const LETTER_BY_CODEPOINT: ReadonlyMap<string, ConceptId> = new Map(
  ARABIC_LETTERS.map((letter) => [letter.codepoint, letter.id]),
);
const HARAKAH_BY_CODEPOINT: ReadonlyMap<string, HarakahId> = new Map(
  HARAKAT.map((harakah) => [harakah.codepoint, harakah.id]),
);

const FORMS: readonly string[] = ["isolated", "initial", "medial", "final"];

/**
 * The lattice concepts one lesson element teaches.
 *
 * Pure, and total: an element this build cannot resolve returns an empty list rather
 * than a guess. Concepts that do not exist in the lattice are filtered out, so a
 * lesson can never point a learner at a skill the engine has never heard of.
 */
export function conceptIdsOfElement(element: LessonElement): readonly ConceptId[] {
  const letterId =
    element.letter === undefined ? undefined : LETTER_BY_CODEPOINT.get(element.letter);

  if (element.harakah !== undefined && letterId !== undefined) {
    const harakah = HARAKAH_BY_CODEPOINT.get(element.harakah);
    if (harakah === undefined) return [];
    return keep([letterHarakahConceptId(letterId, harakah)]);
  }

  if (element.forms !== undefined && letterId !== undefined) {
    return keep(
      element.forms
        .filter((form) => FORMS.includes(form))
        .map((form) => formConceptId(letterId, form as LetterForm)),
    );
  }

  if (letterId !== undefined) return keep([letterId]);

  // Marks, tanwīn and madd name lattice ids directly.
  return keep([element.conceptId]);
}

function keep(ids: readonly ConceptId[]): readonly ConceptId[] {
  return ids.filter((id) => conceptById(id) !== null);
}

export interface QaidahLesson extends LessonSummary {
  /** Elements that named a concept this build does not have. Never hidden. */
  readonly unresolvedElements: number;
  readonly hasNarration: boolean;
  readonly talqinRequired: boolean;
}

let lessonCache: readonly QaidahLesson[] | null = null;

/** Every lesson in the package, in teaching order. An absent package is empty. */
export function qaidahLessons(): readonly QaidahLesson[] {
  if (lessonCache !== null) return lessonCache;
  if (!existsSync(LESSON_DIR)) {
    lessonCache = [];
    return lessonCache;
  }

  const lessons = readdirSync(LESSON_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => lessonFileSchema.parse(JSON.parse(readFileSync(path.join(LESSON_DIR, name), "utf8"))))
    .map((file): QaidahLesson => {
      const resolved = file.elements.map((element) => conceptIdsOfElement(element));
      return {
        id: file.id,
        order: file.order,
        kind: file.kind,
        titleKey: `reading.lesson.${file.id}`,
        prerequisites: file.prerequisites,
        conceptIds: resolved.flat(),
        unresolvedElements: resolved.filter((ids) => ids.length === 0).length,
        hasNarration: file.narration !== undefined,
        talqinRequired: file.talqin?.required === true,
      };
    })
    .sort((a, b) => a.order - b.order);

  lessonCache = Object.freeze(lessons);
  return lessonCache;
}

export function qaidahLesson(id: string): QaidahLesson | null {
  return qaidahLessons().find((lesson) => lesson.id === id) ?? null;
}

let lexiconCache: readonly LexiconTerm[] | null = null;

/** Arabic terms narration is allowed to speak. Terms, never a passage. */
export function qaidahLexicon(): readonly LexiconTerm[] {
  if (lexiconCache !== null) return lexiconCache;
  if (!existsSync(LEXICON_PATH)) {
    lexiconCache = [];
    return lexiconCache;
  }
  lexiconCache = Object.freeze(
    lexiconSchema.parse(JSON.parse(readFileSync(LEXICON_PATH, "utf8"))).terms,
  );
  return lexiconCache;
}

export function lexiconTerm(id: string): LexiconTerm | null {
  return qaidahLexicon().find((term) => term.id === id) ?? null;
}

/**
 * A lesson's narration, or `null`.
 *
 * The manifest's English prose is what a neural voice reads; the Arabic in it is
 * checked against the lexicon by `verify_narration.mjs` before it can ship. Nothing
 * here synthesises Arabic, and no recitation is ever produced from this path.
 */
export function narrationFor(lessonId: string): NarrationManifest | null {
  const file = path.join(NARRATION_DIR, `${lessonId}.json`);
  if (!existsSync(file)) return null;
  return narrationSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}
