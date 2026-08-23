/**
 * Sacred content types.
 *
 * Layout data holds *references* to corpus tokens. It never carries its
 * own copy of a Qur'anic string, so there is exactly one place a word can
 * be wrong, and exactly one place to verify.
 */

export type CorpusVersionId = string & { readonly __brand: "CorpusVersionId" };
export type WordId = string & { readonly __brand: "WordId" };
export type AyahId = string & { readonly __brand: "AyahId" };
export type LayoutTokenId = string & { readonly __brand: "LayoutTokenId" };

export interface Surah {
  number: number;
  ayahCount: number;
}

export interface Ayah {
  id: AyahId;
  surahNumber: number;
  numberInSurah: number;
}

export interface Word {
  id: WordId;
  ayahId: AyahId;
  /** 1-based position within the ayah. Must be contiguous. */
  position: number;
  /**
   * The verified Uthmani token, verbatim from the approved corpus.
   * Never authored by hand, never produced or altered by a model.
   */
  text: string;
}

export interface WaqfMark {
  id: string;
  wordId: WordId;
  /** Symbol identifier from the approved source — not a rendered glyph guess. */
  symbol: string;
}

export interface LayoutToken {
  id: LayoutTokenId;
  pageNumber: number;
  /** 1-based line within the page. */
  lineNumber: number;
  /** 1-based position within the line, in reading (RTL) order. */
  positionInLine: number;
  wordId: WordId;
}

export interface MushafPage {
  number: number;
  lineCount: number;
}

export interface CorpusPayload {
  corpusVersionId: CorpusVersionId;
  edition: string;
  surahs: readonly Surah[];
  ayahs: readonly Ayah[];
  words: readonly Word[];
  pages: readonly MushafPage[];
  layoutTokens: readonly LayoutToken[];
  waqfMarks: readonly WaqfMark[];
}

/**
 * Measured alignment methods only.
 *
 * There is deliberately no "estimated" member. If timings were not
 * measured, no alignment asset exists and word highlighting is disabled
 * with an explanation shown to the learner.
 */
export type AlignmentMethod =
  | "forced_alignment_reviewed"
  | "manual_annotation"
  | "studio_timecode";

export interface LicenceRecord {
  holder: string;
  terms: string;
  /** ISO 3166-1 alpha-2 codes, or "WORLD". */
  territories: readonly string[];
  /** Epoch ms. Checked at release time, not by human memory. */
  expiresAt: number | null;
}

export interface ContentApproval {
  reviewerId: string;
  reviewerName: string;
  /** The qualification that makes this person competent to approve. */
  reviewerCredential: string;
  decision: "approved" | "rejected" | "pending";
  decidedAt: number | null;
  notes?: string;
}

export interface ContentSource {
  id: string;
  publisher: string;
  edition: string;
  printing: string;
  licence: LicenceRecord;
  approval: ContentApproval;
}

/**
 * Corpus manifest. `loadCorpus` refuses any corpus that does not present
 * one, and refuses to mark a corpus releasable unless every gate passes.
 */
export interface CorpusManifest {
  corpusVersionId: CorpusVersionId;
  edition: string;
  /**
   * `approved` is real, released content.
   * `synthetic_development` is a structurally-shaped fixture containing no
   * Qur'anic text. It can never be released — enforced, not documented.
   */
  kind: "approved" | "synthetic_development";
  /** Lowercase hex sha256 of the canonical JSON payload. */
  sha256: string;
  counts: {
    surahs: number;
    ayahs: number;
    words: number;
    pages: number;
    layoutTokens: number;
  };
  /** Madani layout is 15 lines; the opening pages are legitimate exceptions. */
  expectedLinesPerPage: number;
  lineCountExceptions: Readonly<Record<string, number>>;
  source: ContentSource;
  alignment:
    | { available: true; method: AlignmentMethod; assetId: string }
    | { available: false; reason: string };
  lifecycle: "draft" | "candidate" | "published" | "superseded";
  supersededBy?: CorpusVersionId;
}
