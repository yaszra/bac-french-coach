#!/usr/bin/env node
/**
 * Build the muṣḥaf layout: which āyahs sit on which of the 604 pages, and where
 * the juzʾ, ḥizb and sajdah marks fall.
 *
 * The layout file carries REFERENCES ONLY — sūrah and āyah numbers. Not one
 * character of Arabic is written here. A renderer joins this to the corpus at
 * runtime; that separation is what makes it impossible for a layout change to
 * alter the text.
 *
 * What is canonical and what is not:
 *   · PAGE boundaries are canonical, from the Ḥafṣ Madani muṣḥaf metadata in
 *     the `quran-meta` package, and are verified here (604 pages, contiguous,
 *     covering exactly 6236 āyahs).
 *   · LINE breaks within a page (the "15 lines" of the Madani muṣḥaf) are NOT
 *     available from any source reachable here. They are recorded as
 *     "not_yet_recorded" rather than approximated, because a guessed line break
 *     shown on a muṣḥaf page would be a lie a learner would memorise.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  PageList,
  JuzList,
  SajdaList,
  getPageMeta,
  findSurahAyahByAyahId,
  createHafs,
  meta,
} from "quran-meta/hafs";
import { AYAH_COUNTS, AYAH_TOTAL, PAGE_COUNT, JUZ_COUNT } from "./lib/canonical.mjs";

const OUT_DIR = path.join(import.meta.dirname, "..", "content", "mushaf");
const OUT_PATH = path.join(OUT_DIR, "madani-15.json");

function build() {
  const data = createHafs();
  const pages = [];

  for (let pageNum = 1; pageNum <= PAGE_COUNT; pageNum++) {
    const page = getPageMeta(pageNum, data);
    const [firstSura, firstAyah] = page.first;
    const [lastSura, lastAyah] = page.last;

    // A page can span several sūrahs; express it as one range per sūrah so a
    // renderer never has to reason about wrapping.
    const ranges = [];
    for (let sura = firstSura; sura <= lastSura; sura++) {
      const from = sura === firstSura ? firstAyah : 1;
      const to =
        sura === lastSura
          ? lastAyah
          : findSurahAyahByAyahId(firstAyahIdOfSura(sura + 1) - 1)[1];
      ranges.push({ sura, ayahFrom: from, ayahTo: to });
    }

    pages.push({
      page: pageNum,
      firstAyahId: page.firstAyahId,
      lastAyahId: page.lastAyahId,
      ranges,
      // Honest absence, not an invented layout.
      lines: "not_yet_recorded",
    });
  }

  const juz = [];
  for (let n = 1; n <= JUZ_COUNT; n++) {
    const ayahId = JuzList[n];
    const [sura, ayah] = findSurahAyahByAyahId(ayahId);
    juz.push({ juz: n, startsAt: { sura, ayah }, ayahId });
  }

  const sajdas = SajdaList.map((ayahId, index) => {
    const [sura, ayah] = findSurahAyahByAyahId(ayahId);
    return { index: index + 1, sura, ayah, ayahId };
  });

  return { pages, juz, sajdas };
}

function firstAyahIdOfSura(sura) {
  return SURA_FIRST_AYAH_ID[sura];
}

/** ayahId of the first āyah of each sūrah, derived once from the canonical counts. */
const SURA_FIRST_AYAH_ID = (() => {
  const ids = new Array(116).fill(0);
  let running = 1;
  for (let sura = 1; sura <= 114; sura++) {
    ids[sura] = running;
    running += AYAH_COUNTS[sura - 1];
  }
  ids[115] = running;
  return ids;
})();

function verify(layout) {
  const problems = [];
  if (layout.pages.length !== PAGE_COUNT) {
    problems.push(`expected ${PAGE_COUNT} pages, built ${layout.pages.length}`);
  }
  if (layout.juz.length !== JUZ_COUNT) {
    problems.push(`expected ${JUZ_COUNT} juzʾ, built ${layout.juz.length}`);
  }

  // Pages must be contiguous and cover every āyah exactly once.
  let expectedNext = 1;
  for (const page of layout.pages) {
    if (page.firstAyahId !== expectedNext) {
      problems.push(`page ${page.page} starts at āyah ${page.firstAyahId}, expected ${expectedNext}`);
    }
    if (page.lastAyahId < page.firstAyahId) {
      problems.push(`page ${page.page} ends before it starts`);
    }
    expectedNext = page.lastAyahId + 1;
  }
  if (expectedNext - 1 !== AYAH_TOTAL) {
    problems.push(`pages cover ${expectedNext - 1} āyahs, expected ${AYAH_TOTAL}`);
  }

  // Not one Arabic character may appear in a layout file.
  const serialized = JSON.stringify(layout);
  const arabic = serialized.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g);
  if (arabic) problems.push(`layout contains ${arabic.length} Arabic characters; it must carry references only`);

  return problems;
}

async function main() {
  const layout = build();
  const problems = verify(layout);
  if (problems.length > 0) {
    console.error("[layout] FAILED:");
    for (const problem of problems) console.error(`  · ${problem}`);
    process.exit(1);
  }

  const document = {
    id: "madani-15",
    label: "Madani muṣḥaf, 604 pages",
    pageCount: PAGE_COUNT,
    linesPerPage: 15,
    source: {
      pages: "quran-meta npm package (Ḥafṣ riwāyah metadata)",
      version: meta.riwayaName,
      note: "Page boundaries are canonical and verified. Line breaks within a page are not available from any reachable source and are recorded as not_yet_recorded rather than approximated.",
    },
    containsArabic: false,
    ...layout,
  };

  await mkdir(OUT_DIR, { recursive: true });
  const json = JSON.stringify(document, null, 0) + "\n";
  await writeFile(OUT_PATH, json, "utf8");

  console.log(
    `[layout] ${document.pages.length} pages, ${document.juz.length} juzʾ, ${document.sajdas.length} sajdas`,
  );
  console.log(`[layout] sha256 ${createHash("sha256").update(json).digest("hex")}`);
  console.log(`[layout] line breaks: not_yet_recorded (honest absence)`);
}


main().catch((error) => {
  console.error(error);
  process.exit(1);
});
