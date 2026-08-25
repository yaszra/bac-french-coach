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
  readonly page: number;
  readonly surah: number;
  readonly ayahFrom: number;
  readonly ayahTo: number;
  readonly juz: number;
  readonly lines: readonly MushafLine[];
  /** True when the layout package still records its line breaks as unknown. */
  readonly linesArePacked: boolean;
};

/** What the layout file says belongs on a page. */
type PageRange = {
  readonly surah: number;
  readonly ayahFrom: number;
  readonly ayahTo: number;
  readonly juz: number;
  readonly linesRecorded: boolean;
};

type AyahText = { readonly ayah: number; readonly text: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Accept the shapes a Qurʾān corpus is plausibly stored in, and refuse
 * everything else rather than guessing. An unrecognised file yields nothing,
 * and nothing is exactly what the page then shows.
 */
function readSurah(corpus: unknown, surah: number): readonly AyahText[] {
  /* A flat list: [{ sura | surah | chapter, ayah | verse, text }] */
  const list = Array.isArray(corpus)
    ? corpus
    : isRecord(corpus) && Array.isArray(corpus.verses)
      ? corpus.verses
      : isRecord(corpus) && Array.isArray(corpus.ayahs)
        ? corpus.ayahs
        : null;

  if (list) {
    return list
      .filter(isRecord)
      .map((entry) => ({
        surah: Number(entry.sura ?? entry.surah ?? entry.chapter),
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

  /* Keyed by sūrah: { "1": { "1": "…" } } or { "1": ["…", "…"] } */
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
        .filter(
          (entry): entry is AyahText =>
            typeof entry.text === "string" && Number.isFinite(entry.ayah),
        )
        .sort((a, b) => a.ayah - b.ayah);
    }
  }

  return [];
}

/**
 * Ask the layout package what page 1 carries. The layout file holds references
 * only — never Arabic — and honestly records `lines: "not_yet_recorded"` while
 * its line breaks are unknown, which is why the words below are packed rather
 * than justified.
 */
async function readLayout(page: number): Promise<PageRange | null> {
  try {
    const file = path.join(process.cwd(), "content", "mushaf", "madani-15.json");
    const layout: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!isRecord(layout) || !Array.isArray(layout.pages)) return null;

    const entry = layout.pages.filter(isRecord).find((candidate) => candidate.page === page);
    if (!entry || !Array.isArray(entry.ranges)) return null;
    const range = entry.ranges.filter(isRecord)[0];
    if (!range) return null;

    const surah = Number(range.sura ?? range.surah);
    const ayahFrom = Number(range.ayahFrom);
    const ayahTo = Number(range.ayahTo);
    if (!Number.isFinite(surah) || !Number.isFinite(ayahFrom) || !Number.isFinite(ayahTo)) {
      return null;
    }

    const ayahId = Number(entry.firstAyahId);
    const juzEntries = Array.isArray(layout.juz) ? layout.juz.filter(isRecord) : [];
    const juz = juzEntries.reduce((current, candidate) => {
      const startsAt = Number(candidate.ayahId);
      const number = Number(candidate.juz);
      if (!Number.isFinite(startsAt) || !Number.isFinite(number)) return current;
      return startsAt <= ayahId && number > current ? number : current;
    }, 1);

    return { surah, ayahFrom, ayahTo, juz, linesRecorded: Array.isArray(entry.lines) };
  } catch {
    return null;
  }
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

export function loadRepresentativePage(page = 1): Promise<RepresentativePage | null> {
  cached ??= (async () => {
    try {
      /* Statically scoped so the bundler does not trace the whole project. */
      const file = path.join(process.cwd(), "content", "quran", "quran-uthmani.json");
      const raw = await readFile(file, "utf8");

      const layout = (await readLayout(page)) ?? {
        surah: 1,
        ayahFrom: 1,
        ayahTo: Number.POSITIVE_INFINITY,
        juz: 1,
        linesRecorded: false,
      };

      const ayahs = readSurah(JSON.parse(raw), layout.surah).filter(
        (entry) => entry.ayah >= layout.ayahFrom && entry.ayah <= layout.ayahTo,
      );
      if (ayahs.length === 0) return null;

      return {
        page,
        surah: layout.surah,
        ayahFrom: layout.ayahFrom,
        ayahTo: ayahs[ayahs.length - 1]?.ayah ?? layout.ayahFrom,
        juz: layout.juz,
        lines: toLines(ayahs),
        linesArePacked: !layout.linesRecorded,
      };
    } catch {
      /* No corpus in this checkout: the page reports that, and invents nothing. */
      return null;
    }
  })();
  return cached;
}
