#!/usr/bin/env node
/**
 * Fetch per-word recitation timings, for the word-sync highlight.
 *
 * Timings are MEASURED, never estimated. A word highlight that drifts teaches a
 * learner the wrong rhythm, and an interpolated timing is indistinguishable
 * from a measured one once it is on screen — so this script will write nothing
 * rather than write a guess. When no source is reachable, it records
 * "not_yet_recorded" and the product shows the honest state: audio plays, no
 * highlight follows it.
 *
 * Every fetched set is cut-verified before it is accepted: timings must be
 * monotonic, non-overlapping, and contained within the āyah's duration.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const OUT_DIR = path.join(import.meta.dirname, "..", "content", "timings");

/**
 * The seven reciters the product ships with. Each needs BOTH a licensed audio
 * mirror and a measured timing set; a reciter with audio but no timings is
 * usable, one with timings but no audio is not.
 */
export const RECITERS = [
  { id: "husary", name: "Maḥmūd Khalīl al-Ḥuṣarī", style: "murattal" },
  { id: "husary_muallim", name: "Maḥmūd Khalīl al-Ḥuṣarī (muʿallim)", style: "teaching" },
  { id: "minshawi", name: "Muḥammad Ṣiddīq al-Minshāwī", style: "murattal" },
  { id: "minshawi_muallim", name: "Muḥammad Ṣiddīq al-Minshāwī (muʿallim)", style: "teaching" },
  { id: "abdulbasit", name: "ʿAbd al-Bāsiṭ ʿAbd al-Ṣamad", style: "murattal" },
  { id: "alafasy", name: "Mishary Rāshid al-ʿAfāsy", style: "murattal" },
  { id: "sudais", name: "ʿAbd al-Raḥmān al-Sudays", style: "murattal" },
];

const SOURCES = [
  {
    id: "quran-align",
    label: "cpfair/quran-align measured word timings",
    url: (reciter) => `https://raw.githubusercontent.com/cpfair/quran-align/master/${reciter}.json`,
  },
];

/**
 * Cut verification. A timing set is only as good as its worst āyah, so every
 * āyah is checked and the whole set is refused if any fails.
 */
export function verifyTimings(ayahTimings) {
  const problems = [];
  for (const ayah of ayahTimings) {
    const words = ayah.words ?? [];
    if (words.length === 0) {
      problems.push(`${ayah.sura}:${ayah.ayah} has no word timings`);
      continue;
    }
    let previousEnd = -1;
    for (const [index, word] of words.entries()) {
      if (!Number.isFinite(word.startMs) || !Number.isFinite(word.endMs)) {
        problems.push(`${ayah.sura}:${ayah.ayah} word ${index} has a non-numeric timing`);
        break;
      }
      if (word.endMs <= word.startMs) {
        problems.push(`${ayah.sura}:${ayah.ayah} word ${index} ends before it starts`);
        break;
      }
      if (word.startMs < previousEnd) {
        problems.push(`${ayah.sura}:${ayah.ayah} word ${index} overlaps the previous word`);
        break;
      }
      previousEnd = word.endMs;
    }
    if (ayah.durationMs !== undefined && previousEnd > ayah.durationMs) {
      problems.push(`${ayah.sura}:${ayah.ayah} extends past the end of its audio`);
    }
  }
  return { ok: problems.length === 0, problems };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const results = [];

  for (const reciter of RECITERS) {
    let recorded = false;
    for (const source of SOURCES) {
      try {
        const response = await fetch(source.url(reciter.id), { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = Buffer.from(await response.arrayBuffer());
        const parsed = JSON.parse(raw.toString("utf8"));

        const { ok, problems } = verifyTimings(parsed);
        if (!ok) {
          console.log(`[timings] ${reciter.id}: rejected by cut verification (${problems.length} problems)`);
          results.push({ reciterId: reciter.id, state: "rejected", source: source.id, problems: problems.slice(0, 5) });
          continue;
        }

        const outPath = path.join(OUT_DIR, `${reciter.id}.json`);
        await writeFile(outPath, JSON.stringify(parsed, null, 0) + "\n", "utf8");
        results.push({
          reciterId: reciter.id,
          state: "measured",
          source: source.id,
          sha256: createHash("sha256").update(raw).digest("hex"),
          ayahCount: parsed.length,
        });
        console.log(`[timings] ${reciter.id}: ${parsed.length} āyahs, cut-verified`);
        recorded = true;
        break;
      } catch (error) {
        results.push({ reciterId: reciter.id, state: "unreachable", source: source.id, error: String(error.message) });
      }
    }
    if (!recorded) console.log(`[timings] ${reciter.id}: not yet recorded`);
  }

  const measured = results.filter((r) => r.state === "measured");
  await writeFile(
    path.join(OUT_DIR, "STATUS.json"),
    JSON.stringify(
      {
        state: measured.length > 0 ? "partial" : "not_yet_recorded",
        checkedAt: new Date().toISOString().slice(0, 10),
        reciters: RECITERS.map((reciter) => ({
          ...reciter,
          timings: results.find((r) => r.reciterId === reciter.id && r.state === "measured")
            ? "measured"
            : "not_yet_recorded",
        })),
        attempts: results,
        note:
          "Word timings are measured or absent. Nothing here is interpolated: a highlight that drifts teaches the wrong rhythm, so the product shows audio without a highlight rather than a highlight that is a guess.",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(
    `[timings] ${measured.length} of ${RECITERS.length} reciters have measured timings; the rest are recorded as not yet recorded`,
  );
}

if (import.meta.filename === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
