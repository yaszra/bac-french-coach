#!/usr/bin/env node
/**
 * THE QĀʿIDAH LESSON GATE.
 *
 * The Qāʿidah teaches the letters that scripture is written in. It therefore
 * legitimately contains Arabic — single letters, marks, and letter+ḥarakah
 * combinations. What it must never contain is a passage of the Qurʾān: the
 * primer REFERENCES scripture, it does not retype it.
 *
 * This gate proves:
 *   1. every lesson matches the schema and declares its prerequisites;
 *   2. prerequisites exist and form no cycle, so a learner can always start;
 *   3. every Arabic element is a single letter, a single mark, or a letter with
 *      marks — nothing longer, and never a multi-word phrase;
 *   4. lesson order is a valid teaching order (a lesson never precedes what it
 *      depends on).
 * The corpus tripwire in verify_content.mjs scans these files too.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const LESSON_DIR = path.join(ROOT, "content", "qaidah", "lessons");

const ARABIC_LETTER = /^[ء-ي]$/u;
const ARABIC_MARK = /^[ً-ْٰ]$/u;
/** One letter carrying any number of marks — the largest legal teaching unit. */
const LETTER_WITH_MARKS = /^[ء-ي][ً-ْٰ]*$/u;

const failures = [];
const fail = (message) => failures.push(message);

const KINDS = new Set([
  "letter", "letter_form", "letter_harakah", "makhraj_group",
  "sukun", "shaddah", "madd", "tanwin", "tajwid_rule",
]);

function checkArabicStrings(lessonId, node, pathLabel) {
  if (typeof node === "string") {
    if (!/[؀-ۿ]/u.test(node)) return;
    if (ARABIC_LETTER.test(node) || ARABIC_MARK.test(node) || LETTER_WITH_MARKS.test(node)) return;
    if (node.trim().includes(" ")) {
      fail(`${lessonId}: "${pathLabel}" contains a multi-word Arabic phrase. Lessons teach letters, not passages.`);
    } else {
      fail(`${lessonId}: "${pathLabel}" contains an Arabic string longer than one letter with its marks`);
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => checkArabicStrings(lessonId, item, `${pathLabel}[${index}]`));
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      checkArabicStrings(lessonId, value, pathLabel ? `${pathLabel}.${key}` : key);
    }
  }
}

async function main() {
  let files;
  try {
    files = (await readdir(LESSON_DIR)).filter((name) => name.endsWith(".json"));
  } catch {
    fail("content/qaidah/lessons is missing — the reading primer has no lessons");
    files = [];
  }

  const lessons = new Map();
  for (const file of files) {
    const lesson = JSON.parse(await readFile(path.join(LESSON_DIR, file), "utf8"));
    const id = lesson.id ?? file;

    if (!lesson.id) fail(`${file}: missing id`);
    if (path.basename(file, ".json") !== lesson.id) fail(`${file}: filename does not match id "${lesson.id}"`);
    if (!KINDS.has(lesson.kind)) fail(`${id}: unknown kind "${lesson.kind}"`);
    if (typeof lesson.titleKey !== "string" || !lesson.titleKey.startsWith("lesson.")) {
      fail(`${id}: titleKey must be an i18n key beginning "lesson." — lessons carry no literal titles`);
    }
    if (!Array.isArray(lesson.elements) || lesson.elements.length === 0) fail(`${id}: has no elements`);
    if (!Array.isArray(lesson.prerequisites)) fail(`${id}: prerequisites must be a list`);
    if (!Array.isArray(lesson.activities) || lesson.activities.length === 0) fail(`${id}: has no activities`);
    for (const activity of lesson.activities ?? []) {
      if (!["recognition", "production"].includes(activity)) {
        fail(`${id}: unknown activity "${activity}"`);
      }
    }
    // Talqīn must declare an honest resolution chain ending in "not yet recorded".
    const resolution = lesson.talqin?.resolution;
    if (!Array.isArray(resolution) || resolution.at(-1) !== "not_yet_recorded") {
      fail(`${id}: talqīn resolution must end in "not_yet_recorded" — a machine voice is never a silent fallback`);
    }

    for (const element of lesson.elements ?? []) {
      if (!element.conceptId) fail(`${id}: an element has no conceptId`);
    }

    checkArabicStrings(id, lesson, "");
    lessons.set(id, lesson);
  }

  // Prerequisites must exist, and the order must be teachable.
  for (const [id, lesson] of lessons) {
    for (const prerequisite of lesson.prerequisites ?? []) {
      if (!lessons.has(prerequisite)) {
        fail(`${id}: prerequisite "${prerequisite}" does not exist`);
        continue;
      }
      const before = lessons.get(prerequisite);
      if (before.order >= lesson.order) {
        fail(`${id} (order ${lesson.order}) depends on ${prerequisite} (order ${before.order}), which comes later`);
      }
    }
  }

  // No cycles, so there is always somewhere to begin.
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      fail(`prerequisite cycle: ${[...trail, id].join(" → ")}`);
      return;
    }
    state.set(id, "visiting");
    for (const prerequisite of lessons.get(id)?.prerequisites ?? []) {
      if (lessons.has(prerequisite)) visit(prerequisite, [...trail, id]);
    }
    state.set(id, "done");
  };
  for (const id of lessons.keys()) visit(id, []);

  if (lessons.size > 0 && ![...lessons.values()].some((l) => (l.prerequisites ?? []).length === 0)) {
    fail("no lesson is reachable without a prerequisite — a learner could never start");
  }

  console.log(`[qaidah] ${lessons.size} lessons checked`);
  if (failures.length > 0) {
    console.error(`\n[qaidah] GATE FAILED — ${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log("[qaidah] gate passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
