/**
 * Synthetic development corpus.
 *
 * Structurally identical to a real corpus and containing NO Qur'anic text
 * whatsoever — every token is an opaque Latin identifier. This is how the
 * engine is fully testable without a single sacred string entering the
 * repository.
 *
 * `kind: "synthetic_development"` makes it permanently unreleasable; the
 * release gate rejects it regardless of any other configuration.
 */
import type {
  AyahId,
  CorpusManifest,
  CorpusPayload,
  CorpusVersionId,
  LayoutToken,
  LayoutTokenId,
  Word,
  WordId,
  Ayah,
} from "../types.js";
import { sha256Of } from "../corpus.js";

/** Deliberately outside the real surah range so it can never be mistaken. */
const SYNTHETIC_SURAH = 1000;
const LINES_PER_PAGE = 15;
const PAGE_NUMBER = 1;

export interface SyntheticOptions {
  ayahCount?: number;
  wordsPerAyah?: number;
}

export function buildSyntheticCorpus(opts: SyntheticOptions = {}): {
  payload: CorpusPayload;
  manifest: CorpusManifest;
} {
  const ayahCount = opts.ayahCount ?? 3;
  const wordsPerAyah = opts.wordsPerAyah ?? 5;

  const ayahs: Ayah[] = [];
  const words: Word[] = [];
  const layoutTokens: LayoutToken[] = [];

  for (let a = 1; a <= ayahCount; a++) {
    const ayahId = `syn:${SYNTHETIC_SURAH}:${a}` as AyahId;
    ayahs.push({ id: ayahId, surahNumber: SYNTHETIC_SURAH, numberInSurah: a });
    for (let w = 1; w <= wordsPerAyah; w++) {
      const wordId = `${ayahId}:${w}` as WordId;
      words.push({
        id: wordId,
        ayahId,
        position: w,
        // Opaque placeholder. Never Arabic, never Qur'anic.
        text: `SYN-${SYNTHETIC_SURAH}-${a}-${w}`,
      });
      layoutTokens.push({
        id: `lt:${a}:${w}` as LayoutTokenId,
        pageNumber: PAGE_NUMBER,
        lineNumber: a,
        positionInLine: w,
        wordId,
      });
    }
  }

  const payload: CorpusPayload = {
    corpusVersionId: "synthetic-dev-1" as CorpusVersionId,
    edition: "synthetic-development",
    surahs: [{ number: SYNTHETIC_SURAH, ayahCount }],
    ayahs,
    words,
    pages: [{ number: PAGE_NUMBER, lineCount: LINES_PER_PAGE }],
    layoutTokens,
    waqfMarks: [],
  };

  const manifest: CorpusManifest = {
    corpusVersionId: payload.corpusVersionId,
    edition: payload.edition,
    kind: "synthetic_development",
    sha256: sha256Of(payload),
    counts: {
      surahs: payload.surahs.length,
      ayahs: payload.ayahs.length,
      words: payload.words.length,
      pages: payload.pages.length,
      layoutTokens: payload.layoutTokens.length,
    },
    expectedLinesPerPage: LINES_PER_PAGE,
    lineCountExceptions: {},
    source: {
      id: "synthetic",
      publisher: "ATHAR development",
      edition: "synthetic-development",
      printing: "n/a",
      licence: {
        holder: "ATHAR development",
        terms: "internal development fixture only",
        territories: ["WORLD"],
        expiresAt: null,
      },
      approval: {
        reviewerId: "none",
        reviewerName: "none",
        reviewerCredential: "none",
        decision: "pending",
        decidedAt: null,
        notes: "Synthetic fixture. Never eligible for approval or release.",
      },
    },
    alignment: {
      available: false,
      reason: "no measured timings exist for a synthetic corpus",
    },
    lifecycle: "draft",
  };

  return { payload, manifest };
}

/** Layout token IDs for one synthetic ayah, in reading order. */
export function syntheticTokenIdsForAyah(
  payload: CorpusPayload,
  ayahNumber: number,
): string[] {
  const ayahId = `syn:${SYNTHETIC_SURAH}:${ayahNumber}`;
  return payload.layoutTokens
    .filter((t) => {
      const word = payload.words.find((w) => w.id === t.wordId);
      return word?.ayahId === ayahId;
    })
    .sort((a, b) => a.positionInLine - b.positionInLine)
    .map((t) => t.id);
}
