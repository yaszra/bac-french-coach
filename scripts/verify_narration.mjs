#!/usr/bin/env node
/**
 * THE NARRATION GATE.
 *
 * Concept intros are narrated: English prose explaining a letter or a rule,
 * with the Arabic TERM spoken in Arabic. English prose may be synthesized —
 * it is explanation, not recitation. Arabic may only be spoken when it is a
 * term from the reviewed lexicon.
 *
 * This gate proves that every Arabic string in a narration manifest is a term
 * in content/qaidah/lexicon.json, and that no manifest contains a phrase of
 * scripture (the corpus tripwire in verify_content.mjs also scans them).
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const LEXICON_PATH = path.join(ROOT, "content", "qaidah", "lexicon.json");
const NARRATION_DIR = path.join(ROOT, "content", "qaidah", "narration");

const ARABIC = /[؀-ۿ]/u;
const failures = [];
const fail = (message) => failures.push(message);

/** Compare terms without their vowel marks, so a manifest need not match the
 *  lexicon's vocalisation byte for byte to be recognised as the same term. */
function bare(text) {
  return text.replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/gu, "").trim();
}

async function main() {
  if (!existsSync(LEXICON_PATH)) {
    fail("content/qaidah/lexicon.json is missing — narration has no reviewed vocabulary to draw on");
    report(0);
    return;
  }

  const lexicon = JSON.parse(await readFile(LEXICON_PATH, "utf8"));
  const allowed = new Set();
  for (const term of lexicon.terms ?? []) {
    if (!term.ar || !term.translit || !term.gloss) {
      fail(`lexicon term "${term.id ?? "(unnamed)"}" must carry Arabic, transliteration and a gloss`);
      continue;
    }
    if (bare(term.ar).includes(" ")) {
      fail(`lexicon term "${term.id}" is a phrase, not a term. The lexicon holds single terms only.`);
    }
    allowed.add(bare(term.ar));
  }

  let manifests = [];
  if (existsSync(NARRATION_DIR)) {
    manifests = (await readdir(NARRATION_DIR)).filter((name) => name.endsWith(".json"));
  }

  for (const file of manifests) {
    const manifest = JSON.parse(await readFile(path.join(NARRATION_DIR, file), "utf8"));

    if (!manifest.voice) {
      fail(`${file}: no voice declared. Narration must say whether it is human or synthesized.`);
    } else if (!["human", "neural_tts"].includes(manifest.voice)) {
      fail(`${file}: unknown voice "${manifest.voice}"`);
    }

    const walk = (node, label) => {
      if (typeof node === "string") {
        if (!ARABIC.test(node)) return;
        for (const word of node.split(/\s+/).filter((w) => ARABIC.test(w))) {
          if (!allowed.has(bare(word))) {
            fail(
              `${file}: "${label}" speaks the Arabic word "${word}", which is not in the reviewed lexicon. ` +
                `Narration speaks terms, never scripture.`,
            );
          }
        }
        return;
      }
      if (Array.isArray(node)) return node.forEach((item, i) => walk(item, `${label}[${i}]`));
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) walk(value, label ? `${label}.${key}` : key);
      }
    };
    walk(manifest, "");
  }

  console.log(`[narration] ${lexicon.terms?.length ?? 0} lexicon terms, ${manifests.length} manifest(s) checked`);
  report(manifests.length);
}

function report() {
  if (failures.length > 0) {
    console.error(`\n[narration] GATE FAILED — ${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log("[narration] gate passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
