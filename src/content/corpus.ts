/**
 * Corpus import, verification, and the release gate.
 *
 * Every check here corresponds to a way the product could show a learner
 * something that is not the Qur'an. Each returns a distinct issue code so
 * that mutation tests can prove the check would actually fail if the data
 * were corrupted.
 */
import { createHash } from "node:crypto";
import type {
  CorpusManifest,
  CorpusPayload,
  ContentSource,
  WordId,
  AyahId,
} from "./types.js";

export const CONTENT_PIPELINE_VERSION = "athar-content/1.0.0";

export type IntegrityCode =
  | "checksum_mismatch"
  | "count_mismatch_surahs"
  | "count_mismatch_ayahs"
  | "count_mismatch_words"
  | "count_mismatch_pages"
  | "count_mismatch_layout_tokens"
  | "orphan_layout_token"
  | "orphan_word"
  | "orphan_waqf_mark"
  | "unknown_surah"
  | "ayah_count_mismatch"
  | "non_contiguous_word_positions"
  | "duplicate_word_id"
  | "duplicate_layout_token_id"
  | "unexpected_line_count"
  | "duplicate_line_position"
  | "unreferenced_word"
  | "empty_word_text";

export interface IntegrityIssue {
  code: IntegrityCode;
  detail: string;
}

export interface VerificationResult {
  ok: boolean;
  issues: readonly IntegrityIssue[];
  manifest: CorpusManifest;
}

/**
 * Canonical serialization for hashing. Key order is fixed so a checksum
 * is stable across JSON writers and across machines.
 */
export function canonicalize(payload: CorpusPayload): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).sort()) out[k] = sortKeys(src[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sortKeys(payload));
}

export function sha256Of(payload: CorpusPayload): string {
  return createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
}

/**
 * Full integrity verification. Collects every issue rather than failing on
 * the first: an operator fixing an import needs the whole list.
 */
export function verifyCorpus(
  payload: CorpusPayload,
  manifest: CorpusManifest,
): VerificationResult {
  const issues: IntegrityIssue[] = [];
  const add = (code: IntegrityCode, detail: string) =>
    issues.push({ code, detail });

  // --- checksum ---------------------------------------------------------
  const actualHash = sha256Of(payload);
  if (actualHash !== manifest.sha256)
    add(
      "checksum_mismatch",
      `manifest ${manifest.sha256.slice(0, 12)}… vs payload ${actualHash.slice(0, 12)}…`,
    );

  // --- declared counts --------------------------------------------------
  const c = manifest.counts;
  if (payload.surahs.length !== c.surahs)
    add("count_mismatch_surahs", `${payload.surahs.length} vs ${c.surahs}`);
  if (payload.ayahs.length !== c.ayahs)
    add("count_mismatch_ayahs", `${payload.ayahs.length} vs ${c.ayahs}`);
  if (payload.words.length !== c.words)
    add("count_mismatch_words", `${payload.words.length} vs ${c.words}`);
  if (payload.pages.length !== c.pages)
    add("count_mismatch_pages", `${payload.pages.length} vs ${c.pages}`);
  if (payload.layoutTokens.length !== c.layoutTokens)
    add(
      "count_mismatch_layout_tokens",
      `${payload.layoutTokens.length} vs ${c.layoutTokens}`,
    );

  // --- identity uniqueness ---------------------------------------------
  const wordById = new Map<WordId, (typeof payload.words)[number]>();
  for (const w of payload.words) {
    if (wordById.has(w.id)) add("duplicate_word_id", w.id);
    wordById.set(w.id, w);
    if (w.text.length === 0) add("empty_word_text", w.id);
  }

  const layoutIds = new Set<string>();
  for (const t of payload.layoutTokens) {
    if (layoutIds.has(t.id)) add("duplicate_layout_token_id", t.id);
    layoutIds.add(t.id);
  }

  // --- referential integrity -------------------------------------------
  const ayahIds = new Set<AyahId>(payload.ayahs.map((a) => a.id));
  const surahNumbers = new Set(payload.surahs.map((s) => s.number));

  for (const a of payload.ayahs)
    if (!surahNumbers.has(a.surahNumber))
      add("unknown_surah", `ayah ${a.id} → surah ${a.surahNumber}`);

  for (const w of payload.words)
    if (!ayahIds.has(w.ayahId)) add("orphan_word", `${w.id} → ${w.ayahId}`);

  const referencedWords = new Set<WordId>();
  for (const t of payload.layoutTokens) {
    if (!wordById.has(t.wordId))
      add("orphan_layout_token", `${t.id} → ${t.wordId}`);
    referencedWords.add(t.wordId);
  }
  for (const w of payload.words)
    if (!referencedWords.has(w.id))
      add("unreferenced_word", `${w.id} appears on no page`);

  for (const m of payload.waqfMarks)
    if (!wordById.has(m.wordId))
      add("orphan_waqf_mark", `${m.id} → ${m.wordId}`);

  // --- declared ayah counts per surah -----------------------------------
  const ayahsPerSurah = new Map<number, number>();
  for (const a of payload.ayahs)
    ayahsPerSurah.set(a.surahNumber, (ayahsPerSurah.get(a.surahNumber) ?? 0) + 1);
  for (const s of payload.surahs) {
    const actual = ayahsPerSurah.get(s.number) ?? 0;
    if (actual !== s.ayahCount)
      add(
        "ayah_count_mismatch",
        `surah ${s.number}: ${actual} present, ${s.ayahCount} declared`,
      );
  }

  // --- word positions contiguous within each ayah -----------------------
  const positionsByAyah = new Map<AyahId, number[]>();
  for (const w of payload.words) {
    const list = positionsByAyah.get(w.ayahId);
    if (list) list.push(w.position);
    else positionsByAyah.set(w.ayahId, [w.position]);
  }
  for (const [ayahId, positions] of positionsByAyah) {
    const sorted = [...positions].sort((a, b) => a - b);
    const contiguous = sorted.every((p, i) => p === i + 1);
    if (!contiguous)
      add(
        "non_contiguous_word_positions",
        `${ayahId}: [${sorted.join(",")}]`,
      );
  }

  // --- page geometry ----------------------------------------------------
  const tokensByPage = new Map<number, (typeof payload.layoutTokens)[number][]>();
  for (const t of payload.layoutTokens) {
    const list = tokensByPage.get(t.pageNumber);
    if (list) list.push(t);
    else tokensByPage.set(t.pageNumber, [t]);
  }
  for (const page of payload.pages) {
    const expected =
      manifest.lineCountExceptions[String(page.number)] ??
      manifest.expectedLinesPerPage;
    if (page.lineCount !== expected)
      add(
        "unexpected_line_count",
        `page ${page.number}: ${page.lineCount} lines, expected ${expected}`,
      );

    const seen = new Set<string>();
    for (const t of tokensByPage.get(page.number) ?? []) {
      const key = `${t.lineNumber}:${t.positionInLine}`;
      if (seen.has(key))
        add("duplicate_line_position", `page ${page.number} slot ${key}`);
      seen.add(key);
      if (t.lineNumber < 1 || t.lineNumber > page.lineCount)
        add(
          "unexpected_line_count",
          `page ${page.number}: token ${t.id} on line ${t.lineNumber}`,
        );
    }
  }

  return { ok: issues.length === 0, issues, manifest };
}

// --------------------------------------------------------------------------
// Release gate
// --------------------------------------------------------------------------

export type ReleaseBlockCode =
  | "integrity_failed"
  | "not_published"
  | "synthetic_corpus"
  | "approval_missing"
  | "licence_expired"
  | "territory_not_covered"
  | "alignment_method_invalid";

export interface ReleaseDecision {
  releasable: boolean;
  blocks: readonly { code: ReleaseBlockCode; detail: string }[];
}

const MEASURED_METHODS = new Set([
  "forced_alignment_reviewed",
  "manual_annotation",
  "studio_timecode",
]);

/**
 * Whether this corpus version may be referenced by published content for a
 * given territory, at a given moment.
 *
 * Expiry is evaluated here, at release time — never by a human remembering
 * to check a spreadsheet.
 */
export function evaluateRelease(
  verification: VerificationResult,
  territory: string,
  now: number,
): ReleaseDecision {
  const blocks: { code: ReleaseBlockCode; detail: string }[] = [];
  const m = verification.manifest;

  if (!verification.ok)
    blocks.push({
      code: "integrity_failed",
      detail: `${verification.issues.length} integrity issue(s)`,
    });

  if (m.kind === "synthetic_development")
    blocks.push({
      code: "synthetic_corpus",
      detail: "development fixture may never be released",
    });

  if (m.lifecycle !== "published")
    blocks.push({ code: "not_published", detail: `lifecycle is ${m.lifecycle}` });

  const approval = m.source.approval;
  if (approval.decision !== "approved" || approval.decidedAt === null)
    blocks.push({
      code: "approval_missing",
      detail: `approval is ${approval.decision}`,
    });

  const licence = m.source.licence;
  if (licence.expiresAt !== null && licence.expiresAt <= now)
    blocks.push({ code: "licence_expired", detail: `expired at ${licence.expiresAt}` });

  const covered =
    licence.territories.includes("WORLD") || licence.territories.includes(territory);
  if (!covered)
    blocks.push({
      code: "territory_not_covered",
      detail: `${territory} not in [${licence.territories.join(",")}]`,
    });

  if (m.alignment.available && !MEASURED_METHODS.has(m.alignment.method))
    blocks.push({
      code: "alignment_method_invalid",
      detail: `${m.alignment.method} is not a measured method`,
    });

  return { releasable: blocks.length === 0, blocks };
}

/** Whether word-level highlighting may be shown for this corpus. */
export function wordHighlightingAvailable(manifest: CorpusManifest): {
  available: boolean;
  explanation: string;
} {
  if (!manifest.alignment.available)
    return {
      available: false,
      explanation: `Word highlighting is unavailable: ${manifest.alignment.reason}. Audio plays without highlighting rather than showing estimated timings.`,
    };
  return {
    available: true,
    explanation: `Word timings were measured (${manifest.alignment.method}).`,
  };
}

export class CorpusRefusedError extends Error {
  constructor(
    readonly blocks: readonly { code: string; detail: string }[],
    message: string,
  ) {
    super(message);
    this.name = "CorpusRefusedError";
  }
}

export interface LoadedCorpus {
  payload: CorpusPayload;
  manifest: CorpusManifest;
  releasable: boolean;
}

/**
 * The only supported way to bring a corpus into the system.
 *
 * Throws rather than degrading: a corpus that fails integrity is not
 * loaded in a reduced mode, because there is no safe reduced mode for
 * scripture.
 */
export function loadCorpus(
  payload: CorpusPayload,
  manifest: CorpusManifest,
  opts: { territory: string; now: number; allowSyntheticForDevelopment?: boolean },
): LoadedCorpus {
  const verification = verifyCorpus(payload, manifest);
  if (!verification.ok)
    throw new CorpusRefusedError(
      verification.issues.map((i) => ({ code: i.code, detail: i.detail })),
      `Corpus ${manifest.corpusVersionId} failed integrity verification.`,
    );

  // A synthetic fixture is structurally unreleasable, so development may
  // load it once integrity passes. It can never become releasable, whatever
  // else the manifest claims.
  if (manifest.kind === "synthetic_development") {
    if (!opts.allowSyntheticForDevelopment)
      throw new CorpusRefusedError(
        [{ code: "synthetic_corpus", detail: "development fixture may never be released" }],
        `Corpus ${manifest.corpusVersionId} is a development fixture; pass allowSyntheticForDevelopment to load it.`,
      );
    return { payload, manifest, releasable: false };
  }

  const release = evaluateRelease(verification, opts.territory, opts.now);
  if (!release.releasable)
    throw new CorpusRefusedError(
      release.blocks,
      `Corpus ${manifest.corpusVersionId} is not releasable.`,
    );

  return { payload, manifest, releasable: true };
}

/** Convenience for admin surfaces listing why a source cannot go live. */
export function describeSource(source: ContentSource): string {
  const { publisher, edition, printing, licence, approval } = source;
  return [
    `${publisher} — ${edition} (${printing})`,
    `licence: ${licence.holder}, ${licence.territories.join("/")}`,
    `approval: ${approval.decision}${approval.decidedAt ? ` by ${approval.reviewerName} (${approval.reviewerCredential})` : ""}`,
  ].join(" · ");
}
