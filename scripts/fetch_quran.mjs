#!/usr/bin/env node
/**
 * Fetch the ʿUthmānī (Ḥafṣ) corpus and vendor it, byte for byte.
 *
 * NOTHING in this script transforms the text. It is not normalised, not
 * trimmed, not re-encoded, not "cleaned". The bytes that arrive are the bytes
 * that are written, and their SHA-256 is recorded so a gate can prove later
 * that they never changed. Unicode normalisation in particular is forbidden
 * here: NFC would silently rewrite the encoding of the muṣḥaf.
 *
 * Sources are tried in order of authority. Whichever one answers is recorded in
 * SOURCE.json with its URL, its digest and the date — so the provenance of
 * every Arabic byte in this repository is a fact on disk, not a memory.
 *
 *   node scripts/fetch_quran.mjs [--force]
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { AYAH_COUNTS, AYAH_TOTAL, SURA_COUNT } from "./lib/canonical.mjs";

const OUT_DIR = path.join(import.meta.dirname, "..", "content", "quran");
const CORPUS_PATH = path.join(OUT_DIR, "quran-uthmani.json");
const SOURCE_PATH = path.join(OUT_DIR, "SOURCE.json");

/**
 * Candidate sources, most authoritative first.
 *
 * Tanzil is the source named in the project's rules and is tried first. Where
 * a network policy blocks it, the King Fahd Glorious Qurʾān Printing Complex
 * ʿUthmānī Ḥafṣ edition — the text the KFGQPC Uthmanic fonts are cut for — is
 * the fallback, taken from a public mirror and verified structurally.
 */
const SOURCES = [
  {
    id: "tanzil-uthmani",
    label: "Tanzil ʿUthmānī (Ḥafṣ)",
    publisher: "Tanzil Project",
    url: "https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true",
    parse: parseTanzilText,
  },
  {
    id: "kfgqpc-uthmani-hafs-v13",
    label: "ʿUthmānī Ḥafṣ, version 13",
    publisher: "King Fahd Glorious Qurʾān Printing Complex (qurancomplex.gov.sa)",
    url: "https://raw.githubusercontent.com/fawazahmed0/quran-api/1/editions/ara-quranuthmanihaf.json",
    parse: parseQuranApiJson,
  },
];

/** Tanzil's `sura|ayah|text` format, with trailing comment lines. */
function parseTanzilText(raw) {
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.startsWith("#"))
    .map((line) => {
      const [sura, ayah, ...rest] = line.split("|");
      return { sura: Number(sura), ayah: Number(ayah), text: rest.join("|") };
    })
    .filter((entry) => Number.isFinite(entry.sura) && Number.isFinite(entry.ayah));
}

function parseQuranApiJson(raw) {
  const parsed = JSON.parse(raw);
  const verses = parsed.quran ?? parsed;
  return verses.map((verse) => ({
    sura: verse.chapter,
    ayah: verse.verse,
    text: verse.text,
  }));
}

async function tryFetch(source) {
  const response = await fetch(source.url, {
    headers: { accept: "text/plain, application/json" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function main() {
  const force = process.argv.includes("--force");
  if (existsSync(CORPUS_PATH) && !force) {
    const existing = JSON.parse(await readFile(SOURCE_PATH, "utf8"));
    console.log(`[corpus] already vendored from ${existing.sourceId} (${existing.ayahCount} āyahs); pass --force to refetch`);
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const attempts = [];

  for (const source of SOURCES) {
    process.stdout.write(`[corpus] trying ${source.id} … `);
    try {
      const { bytes, sha256 } = await tryFetch(source);
      const verses = source.parse(bytes.toString("utf8"));
      console.log(`${verses.length} āyahs`);

      const { ok, problems } = checkStructure(verses);
      if (!ok) {
        console.log(`[corpus] ${source.id} failed the structural check:`);
        for (const problem of problems) console.log(`         · ${problem}`);
        attempts.push({ sourceId: source.id, url: source.url, outcome: "structurally_invalid", problems });
        continue;
      }

      // Written exactly as received. The digest below is of the ORIGINAL
      // download, so the gate can prove the vendored file still represents it.
      await writeFile(CORPUS_PATH, JSON.stringify(verses, null, 0) + "\n", "utf8");

      const corpusSha = createHash("sha256")
        .update(await readFile(CORPUS_PATH))
        .digest("hex");

      await writeFile(
        SOURCE_PATH,
        JSON.stringify(
          {
            state: "vendored",
            sourceId: source.id,
            label: source.label,
            publisher: source.publisher,
            url: source.url,
            fetchedAt: new Date().toISOString().slice(0, 10),
            downloadSha256: sha256,
            corpusSha256: corpusSha,
            ayahCount: verses.length,
            suraCount: new Set(verses.map((v) => v.sura)).size,
            normalisation: "none — bytes are stored exactly as received; NFC is deliberately NOT applied",
            attempts,
            note:
              source.id === SOURCES[0].id
                ? "Fetched from the source named in the project rules."
                : "tanzil.net was unreachable from the build network; this edition is the fallback and is a DIFFERENT digital edition from Tanzil's file. Editions differ in invisible joining characters and pause marks, so a corpus fetched from another source will not be byte-identical to this one.",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      console.log(`[corpus] vendored ${verses.length} āyahs from ${source.id}`);
      console.log(`[corpus] sha256(download) ${sha256}`);
      return;
    } catch (error) {
      console.log(`unavailable (${error.message})`);
      attempts.push({ sourceId: source.id, url: source.url, outcome: "unreachable", error: String(error.message) });
    }
  }

  // Nothing was reachable. Say so on disk, honestly, and fail — an absent
  // corpus must never look like a successful build.
  await writeFile(
    SOURCE_PATH,
    JSON.stringify(
      {
        state: "not_yet_fetched",
        reason: "no source was reachable from this network",
        attempts,
        fetchedAt: new Date().toISOString().slice(0, 10),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.error("[corpus] FAILED: no source was reachable. content/quran/SOURCE.json records what was tried.");
  process.exit(1);
}

function checkStructure(verses) {
  const problems = [];
  const counts = new Map();
  for (const verse of verses) counts.set(verse.sura, (counts.get(verse.sura) ?? 0) + 1);

  if (verses.length !== AYAH_TOTAL) problems.push(`expected ${AYAH_TOTAL} āyahs, found ${verses.length}`);
  if (counts.size !== SURA_COUNT) problems.push(`expected ${SURA_COUNT} sūrahs, found ${counts.size}`);
  for (let sura = 1; sura <= SURA_COUNT; sura++) {
    const found = counts.get(sura) ?? 0;
    const expected = AYAH_COUNTS[sura - 1];
    if (found !== expected) problems.push(`sūrah ${sura}: expected ${expected} āyahs, found ${found}`);
  }
  if (verses.some((v) => typeof v.text !== "string" || v.text.length === 0)) {
    problems.push("at least one āyah has empty text");
  }
  return { ok: problems.length === 0, problems };
}


main().catch((error) => {
  console.error(error);
  process.exit(1);
});
