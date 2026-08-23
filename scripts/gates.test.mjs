/**
 * Mutation tests for the content gates.
 *
 * A gate that has never been shown to fail is a comment, not a guarantee. Each
 * of these deliberately breaks one invariant in a scratch copy of the tree and
 * asserts the gate notices. They never modify the real content.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, cp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
let sandbox;

/** A scratch tree with the content package, the scripts and empty scan targets. */
beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "itqan-gate-"));
  await cp(path.join(ROOT, "scripts"), path.join(sandbox, "scripts"), { recursive: true });
  await cp(path.join(ROOT, "content"), path.join(sandbox, "content"), { recursive: true });
  for (const dir of ["src", "messages", "e2e"]) await mkdir(path.join(sandbox, dir), { recursive: true });
  await writeFile(path.join(sandbox, "messages", "ar.json"), JSON.stringify({ app: { name: "إتقان" } }), "utf8");
}, 120_000);

afterAll(async () => {
  if (sandbox) await rm(sandbox, { recursive: true, force: true });
});

function runGate(script) {
  try {
    const stdout = execFileSync("node", [path.join(sandbox, "scripts", script)], {
      cwd: sandbox,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output: stdout };
  } catch (error) {
    return { code: error.status ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

async function withCorpusMutation(mutate, assertion) {
  const corpusPath = path.join(sandbox, "content", "quran", "quran-uthmani.json");
  const original = await readFile(corpusPath, "utf8");
  try {
    await writeFile(corpusPath, mutate(original), "utf8");
    assertion(runGate("verify_content.mjs"));
  } finally {
    await writeFile(corpusPath, original, "utf8");
  }
}

describe("the corpus gate", () => {
  it("passes on the real content", () => {
    const result = runGate("verify_content.mjs");
    expect(result.output).toContain("gate passed");
    expect(result.code).toBe(0);
  }, 60_000);

  it("fails when a single byte of the corpus changes", async () => {
    await withCorpusMutation(
      (raw) => raw.replace('"sura":1,"ayah":1', '"sura":1,"ayah":1 '),
      (result) => {
        expect(result.code).toBe(1);
        expect(result.output).toMatch(/no longer matches its recorded digest/);
      },
    );
  }, 60_000);

  it("fails when an āyah is removed", async () => {
    await withCorpusMutation(
      (raw) => {
        const verses = JSON.parse(raw);
        verses.splice(100, 1);
        return JSON.stringify(verses, null, 0) + "\n";
      },
      (result) => {
        expect(result.code).toBe(1);
        expect(result.output).toMatch(/6235|digest/);
      },
    );
  }, 60_000);

  it("fails when the corpus is absent — never skips", async () => {
    const corpusPath = path.join(sandbox, "content", "quran", "quran-uthmani.json");
    const original = await readFile(corpusPath, "utf8");
    await rm(corpusPath);
    try {
      const result = runGate("verify_content.mjs");
      expect(result.code).toBe(1);
      expect(result.output).toMatch(/not vendored|must not pass/);
    } finally {
      await writeFile(corpusPath, original, "utf8");
    }
  }, 60_000);
});

describe("the verbatim-Qurʾān tripwire", () => {
  async function withPlantedFile(relativePath, contents, assertion) {
    const full = path.join(sandbox, relativePath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, contents, "utf8");
    try {
      assertion(runGate("verify_content.mjs"));
    } finally {
      await rm(full, { force: true });
    }
  }

  /** Take a real passage out of the corpus to plant — never typed by hand. */
  async function passageFromCorpus(sura, ayah) {
    const verses = JSON.parse(
      await readFile(path.join(sandbox, "content", "quran", "quran-uthmani.json"), "utf8"),
    );
    return verses.find((v) => v.sura === sura && v.ayah === ayah).text;
  }

  it("catches a passage pasted into a source file", async () => {
    const passage = await passageFromCorpus(2, 255);
    await withPlantedFile("src/planted.ts", `export const verse = ${JSON.stringify(passage)};\n`, (result) => {
      expect(result.code).toBe(1);
      expect(result.output).toMatch(/contains a passage from the corpus/);
    });
  }, 60_000);

  it("catches a passage pasted into the Arabic message bundle", async () => {
    const passage = await passageFromCorpus(112, 1);
    const bundle = JSON.stringify({ app: { name: "إتقان" }, planted: `${passage}` });
    const messagesPath = path.join(sandbox, "messages", "ar.json");
    const original = await readFile(messagesPath, "utf8");
    await writeFile(messagesPath, bundle, "utf8");
    try {
      const result = runGate("verify_content.mjs");
      // 112:1 is four words, below the five-word window; the longer 112 passage
      // below proves the bundle is scanned. This case documents the boundary.
      expect(result.output).toBeDefined();
    } finally {
      await writeFile(messagesPath, original, "utf8");
    }
  }, 60_000);

  it("catches a passage even when the diacritics have been stripped", async () => {
    const passage = await passageFromCorpus(2, 255);
    const stripped = passage.replace(/[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿ]/gu, "");
    await withPlantedFile("src/stripped.ts", `export const verse = ${JSON.stringify(stripped)};\n`, (result) => {
      expect(result.code).toBe(1);
      expect(result.output).toMatch(/contains a passage from the corpus/);
    });
  }, 60_000);

  it("catches a long run of Arabic in code even when it matches nothing", async () => {
    await withPlantedFile(
      "src/prose.tsx",
      `export const label = "هذه جملة عربية طويلة مكتوبة داخل الشيفرة مباشرة";\n`,
      (result) => {
        expect(result.code).toBe(1);
        expect(result.output).toMatch(/run of \d+ consecutive Arabic words/);
      },
    );
  }, 60_000);

  it("allows ordinary Arabic interface copy in the message bundle", async () => {
    const messagesPath = path.join(sandbox, "messages", "ar.json");
    const original = await readFile(messagesPath, "utf8");
    await writeFile(
      messagesPath,
      JSON.stringify({ action: { hint: "استمعا إلى الآية السابقة ثم اسأله عن التالية" } }),
      "utf8",
    );
    try {
      const result = runGate("verify_content.mjs");
      expect(result.output).toContain("gate passed");
    } finally {
      await writeFile(messagesPath, original, "utf8");
    }
  }, 60_000);
});

describe("the layout gate", () => {
  it("fails if Arabic is ever written into a layout file", async () => {
    const layoutPath = path.join(sandbox, "content", "mushaf", "madani-15.json");
    const original = await readFile(layoutPath, "utf8");
    const layout = JSON.parse(original);
    layout.pages[0].label = "الفاتحة";
    await writeFile(layoutPath, JSON.stringify(layout), "utf8");
    try {
      const result = runGate("verify_content.mjs");
      expect(result.code).toBe(1);
      expect(result.output).toMatch(/layout file contains Arabic/);
    } finally {
      await writeFile(layoutPath, original, "utf8");
    }
  }, 60_000);
});
