import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { corpus as corpusSchema, layout as layoutSchema, type Ayah, type MushafPage } from "../schemas/content";

/**
 * The content package, loaded once and never mutated.
 *
 * Two rules shape this file:
 *   · It is READ-ONLY. Nothing here writes, and every structure it returns is
 *     frozen, so no downstream module can accidentally edit the muṣḥaf.
 *   · An absent package is a STATE, not an exception to paper over. The loader
 *     reports `not_yet_recorded` and callers render that honestly, rather than
 *     rendering an empty page that looks like a learner has nothing to read.
 */
const CONTENT_ROOT = path.join(process.cwd(), "content");
const CORPUS_PATH = path.join(CONTENT_ROOT, "quran", "quran-uthmani.json");
const LAYOUT_PATH = path.join(CONTENT_ROOT, "mushaf", "madani-15.json");

export type ContentState =
  | { readonly kind: "loaded" }
  | { readonly kind: "not_yet_recorded"; readonly missing: readonly string[] };

type Loaded = {
  readonly verses: readonly Ayah[];
  readonly byKey: ReadonlyMap<string, Ayah>;
  readonly byPage: ReadonlyMap<number, MushafPage>;
  readonly suraStart: readonly number[];
};

let cache: Loaded | null = null;
let state: ContentState | null = null;

function key(sura: number, ayah: number): string {
  return `${sura}:${ayah}`;
}

function load(): Loaded | null {
  if (cache) return cache;
  if (state?.kind === "not_yet_recorded") return null;

  const missing: string[] = [];
  if (!existsSync(CORPUS_PATH)) missing.push("content/quran/quran-uthmani.json");
  if (!existsSync(LAYOUT_PATH)) missing.push("content/mushaf/madani-15.json");
  if (missing.length > 0) {
    state = { kind: "not_yet_recorded", missing };
    return null;
  }

  const verses = corpusSchema.parse(JSON.parse(readFileSync(CORPUS_PATH, "utf8")));
  const layout = layoutSchema.parse(JSON.parse(readFileSync(LAYOUT_PATH, "utf8")));

  const byKey = new Map<string, Ayah>();
  for (const verse of verses) byKey.set(key(verse.sura, verse.ayah), Object.freeze(verse));

  const byPage = new Map<number, MushafPage>();
  for (const page of layout.pages) byPage.set(page.page, Object.freeze(page));

  // Running āyah ids, so a page's [firstAyahId, lastAyahId] can be resolved
  // without walking the corpus.
  const suraStart: number[] = new Array(116).fill(0);
  let running = 1;
  for (let sura = 1; sura <= 114; sura++) {
    suraStart[sura] = running;
    running += verses.filter((v) => v.sura === sura).length;
  }

  cache = Object.freeze({ verses: Object.freeze(verses), byKey, byPage, suraStart: Object.freeze(suraStart) });
  state = { kind: "loaded" };
  return cache;
}

export function contentState(): ContentState {
  load();
  return state ?? { kind: "not_yet_recorded", missing: ["content/"] };
}

/** One āyah, or null when it does not exist. Never a fabricated placeholder. */
export function getAyah(sura: number, ayah: number): Ayah | null {
  return load()?.byKey.get(key(sura, ayah)) ?? null;
}

export function getAyahRange(sura: number, from: number, to: number): readonly Ayah[] {
  const loaded = load();
  if (!loaded) return [];
  const out: Ayah[] = [];
  for (let ayah = from; ayah <= to; ayah++) {
    const verse = loaded.byKey.get(key(sura, ayah));
    if (verse) out.push(verse);
  }
  return Object.freeze(out);
}

export type PageContent = {
  readonly page: number;
  readonly ranges: MushafPage["ranges"];
  readonly ayahs: readonly Ayah[];
  readonly lines: MushafPage["lines"];
};

/** A muṣḥaf page: the layout's references, resolved against the corpus. */
export function getPage(page: number): PageContent | null {
  const loaded = load();
  const meta = loaded?.byPage.get(page);
  if (!loaded || !meta) return null;

  const ayahs = meta.ranges.flatMap((range) => getAyahRange(range.sura, range.ayahFrom, range.ayahTo));
  return Object.freeze({ page, ranges: meta.ranges, ayahs: Object.freeze(ayahs), lines: meta.lines });
}

export function pageOf(sura: number, ayah: number): number | null {
  const loaded = load();
  if (!loaded) return null;
  for (const [page, meta] of loaded.byPage) {
    const onPage = meta.ranges.some(
      (range) => range.sura === sura && ayah >= range.ayahFrom && ayah <= range.ayahTo,
    );
    if (onPage) return page;
  }
  return null;
}

export function suraLength(sura: number): number | null {
  const loaded = load();
  if (!loaded) return null;
  const next = suraStartOf(sura + 1);
  const start = suraStartOf(sura);
  if (start === null) return null;
  return (next ?? loaded.verses.length + 1) - start;
}

function suraStartOf(sura: number): number | null {
  const loaded = load();
  if (!loaded || sura < 1 || sura > 115) return null;
  return loaded.suraStart[sura] ?? null;
}

/** Words of an āyah, for exercises that operate on word positions. */
export function wordsOf(sura: number, ayah: number): readonly string[] {
  const verse = getAyah(sura, ayah);
  return verse ? Object.freeze(verse.text.split(/\s+/).filter(Boolean)) : [];
}

/** Test seam: forget the cache so a test can simulate an absent package. */
export function resetContentCache(): void {
  cache = null;
  state = null;
}
