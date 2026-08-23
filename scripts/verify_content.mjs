#!/usr/bin/env node
/**
 * THE CORPUS GATE.
 *
 * This is the mechanism behind the sacred-content rule. It fails the build if
 * any of the following is untrue:
 *
 *   1. The corpus is present and complete: 114 sūrahs, 6236 āyahs, and every
 *      sūrah with exactly its canonical number of āyahs.
 *   2. The vendored bytes are exactly the bytes that were fetched — proven
 *      against the digest recorded in SOURCE.json at fetch time.
 *   3. The layout carries no Arabic at all.
 *   4. THE TRIPWIRE: no file in src/, messages/ or content/qaidah/ contains a
 *      run of Arabic words long enough to be a quotation of the corpus. Code
 *      and interface strings REFERENCE scripture; they never embed it. This is
 *      what stops a well-meaning hardcoded āyah from ever reaching a screen.
 *
 * An absent corpus is a FAILURE, never a skip: a build that quietly ships
 * without the text would be the worst possible outcome.
 */
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { AYAH_COUNTS, AYAH_TOTAL, SURA_COUNT } from "./lib/canonical.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const CORPUS_PATH = path.join(ROOT, "content", "quran", "quran-uthmani.json");
const SOURCE_PATH = path.join(ROOT, "content", "quran", "SOURCE.json");
const LAYOUT_PATH = path.join(ROOT, "content", "mushaf", "madani-15.json");

/** Arabic script blocks, including presentation forms. */
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u;
const ARABIC_RUN = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿\s]{2,}/gu;

/** A run of this many consecutive Arabic words is treated as a quotation. */
const QUOTATION_WORDS = 5;

/**
 * Arabic diacritics, alef variants and the joining marks that differ between
 * digital editions. Matching is done on the SKELETON — the consonantal text
 * with these stripped — so a passage retyped from a different muṣḥaf edition,
 * or with the vowels left off, is still recognised as scripture. A tripwire
 * that only caught byte-identical copies would catch almost nothing.
 */
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u200A\u200B-\u200F\u2060]/gu;

function skeleton(text) {
  return text
    .replace(DIACRITICS, "")
    .replace(/[\u0622\u0623\u0625\u0671]/gu, "\u0627") // alef forms → bare alef
    .replace(/\u0629/gu, "\u0647") // tāʾ marbūṭah → hāʾ
    .replace(/[\u0649]/gu, "\u064A") // alef maqṣūrah → yāʾ
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Files that are ALLOWED to contain long Arabic prose, because their whole
 * purpose is Arabic interface copy. They are still checked against the corpus —
 * the length heuristic is simply meaningless for them.
 */
const ARABIC_PROSE_ALLOWED = [
  path.join("messages", "ar.json"),
  path.join("content", "qaidah", "lexicon.json"),
];

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

async function checkCorpus() {
  if (!existsSync(CORPUS_PATH) || !existsSync(SOURCE_PATH)) {
    fail("the corpus is not vendored — run `node scripts/fetch_quran.mjs`. A build without the text must not pass.");
    return null;
  }

  const source = JSON.parse(await readFile(SOURCE_PATH, "utf8"));
  if (source.state !== "vendored") {
    fail(`corpus SOURCE.json reports state "${source.state}" — the text was never fetched successfully`);
    return null;
  }

  const raw = await readFile(CORPUS_PATH);
  const digest = createHash("sha256").update(raw).digest("hex");
  if (digest !== source.corpusSha256) {
    fail(
      `the vendored corpus no longer matches its recorded digest.\n` +
        `      recorded ${source.corpusSha256}\n` +
        `      actual   ${digest}\n` +
        `      Nothing may edit the corpus. Refetch it rather than repairing it by hand.`,
    );
    return null;
  }

  const verses = JSON.parse(raw.toString("utf8"));
  if (verses.length !== AYAH_TOTAL) fail(`expected ${AYAH_TOTAL} āyahs, found ${verses.length}`);

  const counts = new Map();
  for (const verse of verses) counts.set(verse.sura, (counts.get(verse.sura) ?? 0) + 1);
  if (counts.size !== SURA_COUNT) fail(`expected ${SURA_COUNT} sūrahs, found ${counts.size}`);
  for (let sura = 1; sura <= SURA_COUNT; sura++) {
    const found = counts.get(sura) ?? 0;
    if (found !== AYAH_COUNTS[sura - 1]) {
      fail(`sūrah ${sura}: expected ${AYAH_COUNTS[sura - 1]} āyahs, found ${found}`);
    }
  }

  for (const verse of verses) {
    if (typeof verse.text !== "string" || verse.text.trim() === "") {
      fail(`sūrah ${verse.sura}:${verse.ayah} has empty text`);
      break;
    }
    if (!ARABIC.test(verse.text)) {
      fail(`sūrah ${verse.sura}:${verse.ayah} contains no Arabic`);
      break;
    }
  }

  // Ordering must be strictly ascending: a renderer relies on it.
  for (let i = 1; i < verses.length; i++) {
    const previous = verses[i - 1];
    const current = verses[i];
    const ascending =
      current.sura > previous.sura ||
      (current.sura === previous.sura && current.ayah === previous.ayah + 1);
    if (!ascending) {
      fail(`corpus is out of order at ${previous.sura}:${previous.ayah} → ${current.sura}:${current.ayah}`);
      break;
    }
  }

  notes.push(
    `corpus: ${verses.length} āyahs from ${source.sourceId}, digest verified` +
      (source.sourceId.startsWith("tanzil") ? "" : " (NOT the Tanzil edition — see SOURCE.json)"),
  );
  return verses;
}

async function checkLayout() {
  if (!existsSync(LAYOUT_PATH)) {
    fail("the muṣḥaf layout is missing — run `node scripts/build_layout.mjs`");
    return;
  }
  const raw = await readFile(LAYOUT_PATH, "utf8");
  if (ARABIC.test(raw)) {
    fail("the layout file contains Arabic; layout carries references only");
  }
  const layout = JSON.parse(raw);
  if (layout.pages?.length !== 604) fail(`layout has ${layout.pages?.length} pages, expected 604`);
  notes.push(`layout: ${layout.pages.length} pages, no Arabic present`);
}

/** Longest run of consecutive Arabic words in a string. */
function longestArabicWordRun(text) {
  let longest = 0;
  for (const match of text.matchAll(ARABIC_RUN)) {
    const words = match[0].split(/\s+/).filter((word) => word.length > 0 && ARABIC.test(word));
    longest = Math.max(longest, words.length);
  }
  return longest;
}

async function* walk(dir, skip) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (skip.some((pattern) => full.includes(pattern))) continue;
    if (entry.isDirectory()) yield* walk(full, skip);
    else if (/\.(ts|tsx|js|jsx|mjs|json|md|css)$/.test(entry.name)) yield full;
  }
}

async function checkTripwire(verses) {
  // An index of every corpus word-window, so a quotation can be recognised even
  // if it was retyped from the middle of an āyah.
  const windows = new Set();
  if (verses) {
    for (const verse of verses) {
      const words = skeleton(verse.text).split(" ").filter(Boolean);
      for (let i = 0; i + QUOTATION_WORDS <= words.length; i++) {
        windows.add(words.slice(i, i + QUOTATION_WORDS).join(" "));
      }
    }
  }

  const targets = [
    path.join(ROOT, "src"),
    path.join(ROOT, "messages"),
    path.join(ROOT, "content", "qaidah"),
    path.join(ROOT, "e2e"),
  ];
  const skip = ["node_modules", ".next", "content/quran", "content/mushaf"];

  let scanned = 0;
  for (const target of targets) {
    for await (const file of walk(target, skip)) {
      scanned++;
      const text = await readFile(file, "utf8");
      if (!ARABIC.test(text)) continue;

      const relative = path.relative(ROOT, file);
      const prosePermitted = ARABIC_PROSE_ALLOWED.some((allowed) => relative.endsWith(allowed));

      // THE REAL CHECK: does any window of this file's Arabic match the corpus,
      // compared on the skeleton so re-diacritised or re-encoded copies are
      // caught too? This runs on every file, including the Arabic bundles.
      let quoted = false;
      for (const candidate of text.match(ARABIC_RUN) ?? []) {
        const tokens = skeleton(candidate).split(" ").filter(Boolean);
        for (let i = 0; i + QUOTATION_WORDS <= tokens.length; i++) {
          if (windows.has(tokens.slice(i, i + QUOTATION_WORDS).join(" "))) {
            fail(
              `${relative}: contains a passage from the corpus. Scripture is referenced by ` +
                `sūrah and āyah and rendered from content/quran/, never written into a file.`,
            );
            quoted = true;
            break;
          }
        }
        if (quoted) break;
      }
      if (quoted) continue;

      // Outside the declared Arabic-copy files, a long run of Arabic in source
      // code is suspicious even when it matches nothing: it is either scripture
      // from an edition we do not hold, or interface text that belongs in the
      // message bundles.
      if (!prosePermitted) {
        const run = longestArabicWordRun(text);
        if (run >= QUOTATION_WORDS) {
          fail(
            `${relative}: contains a run of ${run} consecutive Arabic words. ` +
              `Interface text belongs in messages/, and scripture is never embedded in code.`,
          );
        }
      }
    }
  }
  notes.push(`tripwire: ${scanned} files scanned, ${windows.size} corpus windows indexed`);
}

async function main() {
  const verses = await checkCorpus();
  await checkLayout();
  await checkTripwire(verses);

  for (const note of notes) console.log(`[content] ${note}`);
  if (failures.length > 0) {
    console.error(`\n[content] GATE FAILED — ${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log("[content] gate passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
