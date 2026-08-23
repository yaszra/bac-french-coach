import { readFile } from "node:fs/promises";
import path from "node:path";
import type { InkDepth, MushafLine, MushafWord } from "@/modules/design/ui/mushaf";

/**
 * The representative page for the catalogue.
 *
 * SACRED-CONTENT RULE: this module reads the vendored Tanzil ʿUthmānī corpus
 * and does nothing to it but split it on whitespace. It never writes, repairs,
 * completes or transliterates a single character. If the corpus is not there,
 * it returns null and the page says "not yet recorded" — the honest state.
 *
 * When `src/modules/content/domain/loader.ts` lands, this should call the
 * loader instead of reading the file directly; the shape below is deliberately
 * defensive so that swap changes nothing on screen.
 */

/** Words per line. Real muṣḥaf line breaks come from the layout package. */
const WORDS_PER_LINE = 7;

/**
 * A specimen ladder. These depths belong to NO learner and are not evidence:
 * they exist so the catalogue can show every rung of the ink scale at once.
 */
const DEPTH_CYCLE: readonly InkDepth[] = [5, 5, 4, 5, 3, 5, 4, 5, 2, 5, 5, 1, 4, 5, 0, 5];

export type RepresentativePage = {
  readonly surah: number;
  readonly lines: readonly MushafLine[];
};

type AyahText = { readonly ayah: number; readonly text: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Accept the shapes a Qurʾān corpus is plausibly stored in, and refuse
 * everything else rather than guessing.
 */
function readSurah(corpus: unknown, surah: number): readonly AyahText[] {
  /* { "1": { "1": "…" } } or { "1": ["…", "…"] } */
  if (isRecord(corpus)) {
    const direct = corpus[String(surah)];
    if (Array.isArray(direct)) {
      return direct
        .map((text, index) => ({ ayah: index + 1, text }))
        .filter((entry): entry is AyahText => typeof entry.text === "string");
    }
    if (isRecord(direct)) {
      return Object.entries(direct)
        .map(([ayah, text]) => ({ ayah: Number(ayah), text }))
        .filter((entry): entry is AyahText => typeof entry.text === "string" && Number.isFinite(entry.ayah))
        .sort((a, b) => a.ayah - b.ayah);
    }
  }

  /* [{ surah, ayah, text }] or { verses: [{ chapter, verse, text }] } */
  const list = Array.isArray(corpus)
    ? corpus
    : isRecord(corpus) && Array.isArray(corpus.verses)
      ? corpus.verses
      : isRecord(corpus) && Array.isArray(corpus.ayahs)
        ? corpus.ayahs
        : null;

  if (!list) return [];

  return list
    .filter(isRecord)
    .map((entry) => ({
      surah: Number(entry.surah ?? entry.chapter ?? entry.sura),
      ayah: Number(entry.ayah ?? entry.verse ?? entry.aya ?? entry.number),
      text: entry.text ?? entry.arabic,
    }))
    .filter(
      (entry): entry is { surah: number; ayah: number; text: string } =>
        entry.surah === surah && Number.isFinite(entry.ayah) && typeof entry.text === "string",
    )
    .sort((a, b) => a.ayah - b.ayah)
    .map(({ ayah, text }) => ({ ayah, text }));
}

function toLines(ayahs: readonly AyahText[]): readonly MushafLine[] {
  const words: MushafWord[] = [];

  for (const { ayah, text } of ayahs) {
    const tokens = text.split(/\s+/u).filter((token) => token.length > 0);
    tokens.forEach((token, position) => {
      words.push({
        text: token,
        depth: DEPTH_CYCLE[words.length % DEPTH_CYCLE.length] ?? 5,
        ayah,
        index: position + 1,
        endsAyah: position === tokens.length - 1,
      });
    });
  }

  const lines: MushafLine[] = [];
  for (let start = 0; start < words.length; start += WORDS_PER_LINE) {
    lines.push({ id: `line-${start}`, words: words.slice(start, start + WORDS_PER_LINE) });
  }
  return lines;
}

let cached: Promise<RepresentativePage | null> | null = null;

export function loadRepresentativePage(surah = 1): Promise<RepresentativePage | null> {
  cached ??= (async () => {
    try {
      /* Statically scoped so the bundler does not trace the whole project. */
      const file = path.join(process.cwd(), "content", "quran", "quran-uthmani.json");
      const raw = await readFile(file, "utf8");
      const ayahs = readSurah(JSON.parse(raw), surah);
      if (ayahs.length === 0) return null;
      return { surah, lines: toLines(ayahs) };
    } catch {
      /* No corpus in this checkout: the page reports that, and invents nothing. */
      return null;
    }
  })();
  return cached;
}
