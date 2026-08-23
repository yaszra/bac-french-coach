/**
 * Sacred-content pipeline — acceptance criterion 20.
 *
 * The mutation block is the important one: for each integrity check we
 * corrupt the payload in the way that check exists to catch, and require
 * the specific issue code. A check that cannot fail is not a check.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  CorpusRefusedError,
  evaluateRelease,
  loadCorpus,
  sha256Of,
  verifyCorpus,
  wordHighlightingAvailable,
  type IntegrityCode,
} from "../src/content/corpus.js";
import type {
  CorpusManifest,
  CorpusPayload,
  WordId,
} from "../src/content/types.js";
import { buildSyntheticCorpus } from "../src/content/fixtures/synthetic.js";
import {
  assertNoSacredText,
  containsArabicScript,
  scanForArabicScript,
} from "../src/content/tripwire.js";

const NOW = Date.UTC(2026, 0, 5);

function fresh(): { payload: CorpusPayload; manifest: CorpusManifest } {
  return buildSyntheticCorpus();
}

/** Re-hash after a deliberate mutation so we test one check at a time. */
function rehash(
  payload: CorpusPayload,
  manifest: CorpusManifest,
): CorpusManifest {
  return { ...manifest, sha256: sha256Of(payload) };
}

describe("a clean corpus verifies", () => {
  it("reports no issues", () => {
    const { payload, manifest } = fresh();
    const result = verifyCorpus(payload, manifest);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("mutation tests — each integrity check actually fires", () => {
  const cases: {
    code: IntegrityCode;
    label: string;
    mutate: (p: CorpusPayload, m: CorpusManifest) => { payload: CorpusPayload; manifest: CorpusManifest };
  }[] = [
    {
      code: "checksum_mismatch",
      label: "a single altered token byte",
      mutate: (p, m) => {
        const words = [...p.words];
        words[0] = { ...words[0]!, text: "TAMPERED" };
        return { payload: { ...p, words }, manifest: m };
      },
    },
    {
      code: "count_mismatch_words",
      label: "a dropped word",
      mutate: (p, m) => {
        const payload = { ...p, words: p.words.slice(1) };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "orphan_layout_token",
      label: "a layout token pointing at a word that does not exist",
      mutate: (p, m) => {
        const layoutTokens = [...p.layoutTokens];
        layoutTokens[0] = { ...layoutTokens[0]!, wordId: "ghost" as WordId };
        const payload = { ...p, layoutTokens };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "orphan_word",
      label: "a word attached to a missing ayah",
      mutate: (p, m) => {
        const payload = { ...p, ayahs: p.ayahs.slice(1) };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "non_contiguous_word_positions",
      label: "a gap in word positions inside an ayah",
      mutate: (p, m) => {
        const words = [...p.words];
        words[1] = { ...words[1]!, position: 99 };
        const payload = { ...p, words };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "duplicate_word_id",
      label: "a duplicated word identifier",
      mutate: (p, m) => {
        const words = [...p.words, { ...p.words[0]! }];
        const payload = { ...p, words };
        return {
          payload,
          manifest: {
            ...rehash(payload, m),
            counts: { ...m.counts, words: words.length },
          },
        };
      },
    },
    {
      code: "duplicate_line_position",
      label: "two tokens claiming the same slot on a page",
      mutate: (p, m) => {
        const layoutTokens = [...p.layoutTokens];
        layoutTokens[1] = {
          ...layoutTokens[1]!,
          lineNumber: layoutTokens[0]!.lineNumber,
          positionInLine: layoutTokens[0]!.positionInLine,
        };
        const payload = { ...p, layoutTokens };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "unexpected_line_count",
      label: "a page whose geometry does not match the approved layout",
      mutate: (p, m) => {
        const pages = [{ ...p.pages[0]!, lineCount: 14 }];
        const payload = { ...p, pages };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "unreferenced_word",
      label: "a word that appears on no page",
      mutate: (p, m) => {
        const layoutTokens = p.layoutTokens.slice(1);
        const payload = { ...p, layoutTokens };
        return {
          payload,
          manifest: {
            ...rehash(payload, m),
            counts: { ...m.counts, layoutTokens: layoutTokens.length },
          },
        };
      },
    },
    {
      code: "ayah_count_mismatch",
      label: "a surah whose declared ayah count is wrong",
      mutate: (p, m) => {
        const surahs = [{ ...p.surahs[0]!, ayahCount: 99 }];
        const payload = { ...p, surahs };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "empty_word_text",
      label: "an empty token",
      mutate: (p, m) => {
        const words = [...p.words];
        words[0] = { ...words[0]!, text: "" };
        const payload = { ...p, words };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "count_mismatch_surahs",
      label: "a surah present in the payload but not declared",
      mutate: (p, m) => {
        const surahs = [...p.surahs, { number: 1001, ayahCount: 0 }];
        const payload = { ...p, surahs };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "count_mismatch_ayahs",
      label: "a dropped ayah",
      mutate: (p, m) => {
        const payload = { ...p, ayahs: p.ayahs.slice(1) };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "count_mismatch_pages",
      label: "an extra page not accounted for",
      mutate: (p, m) => {
        const payload = { ...p, pages: [...p.pages, { number: 2, lineCount: 15 }] };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "count_mismatch_layout_tokens",
      label: "a dropped layout token",
      mutate: (p, m) => {
        const payload = { ...p, layoutTokens: p.layoutTokens.slice(1) };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "unknown_surah",
      label: "an ayah attached to a surah that does not exist",
      mutate: (p, m) => {
        const ayahs = [...p.ayahs];
        ayahs[0] = { ...ayahs[0]!, surahNumber: 4242 };
        const payload = { ...p, ayahs };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "duplicate_layout_token_id",
      label: "a duplicated layout token identifier",
      mutate: (p, m) => {
        const layoutTokens = [...p.layoutTokens];
        layoutTokens[1] = { ...layoutTokens[1]!, id: layoutTokens[0]!.id };
        const payload = { ...p, layoutTokens };
        return { payload, manifest: rehash(payload, m) };
      },
    },
    {
      code: "orphan_waqf_mark",
      label: "a waqf mark on a word that does not exist",
      mutate: (p, m) => {
        const payload = {
          ...p,
          waqfMarks: [{ id: "wq1", wordId: "ghost" as WordId, symbol: "sym" }],
        };
        return { payload, manifest: rehash(payload, m) };
      },
    },
  ];

  it.each(cases)("catches $label -> $code", ({ code, mutate }) => {
    const { payload, manifest } = fresh();
    const mutated = mutate(payload, manifest);
    const result = verifyCorpus(mutated.payload, mutated.manifest);
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain(code);
  });

  it("covers every declared integrity code — a check with no mutation test is not proven", () => {
    const covered = new Set(cases.map((c) => c.code));
    const declared: IntegrityCode[] = [
      "checksum_mismatch",
      "count_mismatch_surahs",
      "count_mismatch_ayahs",
      "count_mismatch_words",
      "count_mismatch_pages",
      "count_mismatch_layout_tokens",
      "orphan_layout_token",
      "orphan_word",
      "orphan_waqf_mark",
      "unknown_surah",
      "ayah_count_mismatch",
      "non_contiguous_word_positions",
      "duplicate_word_id",
      "duplicate_layout_token_id",
      "unexpected_line_count",
      "duplicate_line_position",
      "unreferenced_word",
      "empty_word_text",
    ];
    expect([...declared].filter((c) => !covered.has(c))).toEqual([]);
  });

  it("reports every issue at once, not just the first", () => {
    const { payload, manifest } = fresh();
    const broken: CorpusPayload = {
      ...payload,
      words: payload.words.slice(1),
      ayahs: payload.ayahs.slice(1),
    };
    const result = verifyCorpus(broken, manifest);
    expect(result.issues.length).toBeGreaterThan(2);
  });
});

describe("criterion 20 — nothing reaches production without source, licence, and approval", () => {
  it("refuses a synthetic corpus outright", () => {
    const { payload, manifest } = fresh();
    const decision = evaluateRelease(verifyCorpus(payload, manifest), "GB", NOW);
    expect(decision.releasable).toBe(false);
    expect(decision.blocks.map((b) => b.code)).toContain("synthetic_corpus");
  });

  it("refuses a corpus whose approval is still pending", () => {
    const { payload, manifest } = fresh();
    const approvedish: CorpusManifest = {
      ...manifest,
      kind: "approved",
      lifecycle: "published",
    };
    const decision = evaluateRelease(
      verifyCorpus(payload, approvedish),
      "GB",
      NOW,
    );
    expect(decision.blocks.map((b) => b.code)).toContain("approval_missing");
  });

  it("refuses an expired licence without anyone remembering to check", () => {
    const { payload, manifest } = fresh();
    const m: CorpusManifest = {
      ...manifest,
      kind: "approved",
      lifecycle: "published",
      source: {
        ...manifest.source,
        licence: { ...manifest.source.licence, expiresAt: NOW - 1 },
        approval: {
          reviewerId: "r1",
          reviewerName: "Reviewer",
          reviewerCredential: "ijazah",
          decision: "approved",
          decidedAt: NOW - 1000,
        },
      },
    };
    const decision = evaluateRelease(verifyCorpus(payload, m), "GB", NOW);
    expect(decision.blocks.map((b) => b.code)).toContain("licence_expired");
  });

  it("refuses a territory the licence does not cover", () => {
    const { payload, manifest } = fresh();
    const m: CorpusManifest = {
      ...manifest,
      kind: "approved",
      lifecycle: "published",
      source: {
        ...manifest.source,
        licence: { ...manifest.source.licence, territories: ["MY"] },
        approval: {
          reviewerId: "r1",
          reviewerName: "Reviewer",
          reviewerCredential: "ijazah",
          decision: "approved",
          decidedAt: NOW - 1000,
        },
      },
    };
    const decision = evaluateRelease(verifyCorpus(payload, m), "GB", NOW);
    expect(decision.blocks.map((b) => b.code)).toContain("territory_not_covered");
  });

  it("releases only when integrity, lifecycle, approval, licence, and territory all pass", () => {
    const { payload, manifest } = fresh();
    const m: CorpusManifest = {
      ...manifest,
      kind: "approved",
      lifecycle: "published",
      source: {
        ...manifest.source,
        licence: {
          holder: "Publisher",
          terms: "licensed",
          territories: ["GB"],
          expiresAt: NOW + 86_400_000,
        },
        approval: {
          reviewerId: "r1",
          reviewerName: "Reviewer",
          reviewerCredential: "ijazah",
          decision: "approved",
          decidedAt: NOW - 1000,
        },
      },
    };
    const decision = evaluateRelease(verifyCorpus(payload, m), "GB", NOW);
    expect(decision.blocks).toEqual([]);
    expect(decision.releasable).toBe(true);
  });
});

describe("loadCorpus refuses rather than degrading", () => {
  it("throws on failed integrity — there is no safe reduced mode for scripture", () => {
    const { payload, manifest } = fresh();
    const tampered = { ...manifest, sha256: "0".repeat(64) };
    expect(() =>
      loadCorpus(payload, tampered, { territory: "GB", now: NOW }),
    ).toThrow(CorpusRefusedError);
  });

  it("throws on an unreleasable corpus by default", () => {
    const { payload, manifest } = fresh();
    expect(() => loadCorpus(payload, manifest, { territory: "GB", now: NOW })).toThrow(
      CorpusRefusedError,
    );
  });

  it("permits the synthetic fixture only under an explicit development opt-in", () => {
    const { payload, manifest } = fresh();
    const loaded = loadCorpus(payload, manifest, {
      territory: "GB",
      now: NOW,
      allowSyntheticForDevelopment: true,
    });
    expect(loaded.releasable).toBe(false);
  });

  it("still refuses a broken synthetic corpus even with the opt-in", () => {
    const { payload, manifest } = fresh();
    expect(() =>
      loadCorpus(payload, { ...manifest, sha256: "0".repeat(64) }, {
        territory: "GB",
        now: NOW,
        allowSyntheticForDevelopment: true,
      }),
    ).toThrow(CorpusRefusedError);
  });
});

describe("no estimated word timings, ever", () => {
  it("disables highlighting and explains why when alignment is absent", () => {
    const { manifest } = fresh();
    const result = wordHighlightingAvailable(manifest);
    expect(result.available).toBe(false);
    expect(result.explanation).toContain("estimated timings");
  });

  it("enables highlighting only for a measured method", () => {
    const { manifest } = fresh();
    const withAlignment: CorpusManifest = {
      ...manifest,
      alignment: {
        available: true,
        method: "forced_alignment_reviewed",
        assetId: "a1",
      },
    };
    expect(wordHighlightingAvailable(withAlignment).available).toBe(true);
  });

  it("blocks release if an alignment method is not a measured one", () => {
    const { payload, manifest } = fresh();
    const bad = {
      ...manifest,
      alignment: { available: true as const, method: "estimated" as never, assetId: "a1" },
    };
    const decision = evaluateRelease(verifyCorpus(payload, bad), "GB", NOW);
    expect(decision.blocks.map((b) => b.code)).toContain("alignment_method_invalid");
  });
});

describe("fixture tripwire", () => {
  it("finds no Arabic script anywhere in src outside the allowlist", () => {
    const root = join(import.meta.dirname, "..");
    const hits = scanForArabicScript(root);
    expect(hits).toEqual([]);
  });

  it("would catch an ayah pasted into a component", () => {
    // A single Arabic letter is enough; we never embed a real ayah in a test.
    expect(containsArabicScript("const passage = ب;")).toBe(true);
    expect(containsArabicScript("const passage = 'Al-Mulk 12-15';")).toBe(false);
  });

  it("guards outward boundaries such as logs and notification previews", () => {
    expect(() => assertNoSacredText("ب", "push notification preview")).toThrow(
      /sacred text must never leave/,
    );
    expect(() => assertNoSacredText("Al-Mulk 12-15", "push preview")).not.toThrow();
  });

  it("contains no Arabic script in the synthetic fixture itself", () => {
    const { payload } = fresh();
    for (const w of payload.words) expect(containsArabicScript(w.text)).toBe(false);
  });
});
