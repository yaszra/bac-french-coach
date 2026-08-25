import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE MUṢḤAF CONTRACT TEST.
 *
 * The page a learner recites from is the same page in every theme and every
 * tier. That promise lives in exactly one place — the token sheet — so it is
 * proven here, mechanically, rather than trusted.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const designRoot = path.resolve(here, "..");
const repoRoot = path.resolve(designRoot, "../../..");
const tokensFile = path.join(designRoot, "tokens/marginalia.css");

/** Directories whose CSS is styled from tokens and must therefore be checked. */
const STYLED_ROOTS = [
  path.join(designRoot, "ui"),
  path.join(designRoot, "shells"),
  path.join(repoRoot, "src/app/catalogue"),
];

const FIXED_TOKEN = /^--(mushaf-|ink-depth-)/;
const THEME_OR_TIER = /\[data-(theme|tier)/;
const REM_OR_PX = /^(\d*\.?\d+)(rem|px)$/;

type Block = {
  /** Selectors from the outermost block inwards. */
  readonly chain: readonly string[];
  readonly declarations: ReadonlyMap<string, string>;
};

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** A small block parser: enough for a token sheet and CSS modules, no more. */
function parseCss(css: string): Block[] {
  const source = stripComments(css);
  const blocks: Block[] = [];
  const stack: { selector: string; declarations: Map<string, string> }[] = [];
  let buffer = "";

  const record = () => {
    const declaration = buffer.trim();
    buffer = "";
    const current = stack[stack.length - 1];
    if (!current || !declaration.startsWith("--")) return;
    const colon = declaration.indexOf(":");
    if (colon < 0) return;
    current.declarations.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
  };

  for (const character of source) {
    if (character === "{") {
      stack.push({ selector: buffer.trim().replace(/\s+/g, " "), declarations: new Map() });
      buffer = "";
    } else if (character === "}") {
      record();
      const finished = stack.pop();
      if (finished) {
        blocks.push({
          chain: [...stack.map((entry) => entry.selector), finished.selector],
          declarations: finished.declarations,
        });
      }
    } else if (character === ";") {
      record();
    } else {
      buffer += character;
    }
  }

  return blocks;
}

function cssFilesUnder(root: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) return cssFilesUnder(full);
    return full.endsWith(".css") ? [full] : [];
  });
}

const tokenBlocks = parseCss(readFileSync(tokensFile, "utf8"));

const declaredTokens = new Set<string>();
for (const block of tokenBlocks) {
  for (const name of block.declarations.keys()) declaredTokens.add(name);
}

describe("the muṣḥaf contract", () => {
  it("declares the fixed page tokens and the ink ladder", () => {
    for (const name of [
      "--mushaf-paper",
      "--mushaf-ink",
      "--mushaf-rule",
      "--mushaf-marker",
      "--mushaf-header-band",
      "--mushaf-font-size",
      "--mushaf-leading",
      "--mushaf-word-gap",
      "--ink-depth-0",
      "--ink-depth-1",
      "--ink-depth-2",
      "--ink-depth-3",
      "--ink-depth-4",
      "--ink-depth-5",
    ]) {
      expect(declaredTokens.has(name), `${name} must exist`).toBe(true);
    }
  });

  it("never redefines a --mushaf-* or --ink-depth-* token under a theme or a tier", () => {
    const violations: string[] = [];
    for (const block of tokenBlocks) {
      const themed = block.chain.some((selector) => THEME_OR_TIER.test(selector));
      if (!themed) continue;
      for (const name of block.declarations.keys()) {
        if (FIXED_TOKEN.test(name)) violations.push(`${name} in "${block.chain.join(" ")}"`);
      }
    }
    expect(violations, "the page is the same page in every theme and tier").toEqual([]);
  });

  it("declares each fixed token exactly once in the whole sheet", () => {
    const counts = new Map<string, number>();
    for (const block of tokenBlocks) {
      for (const name of block.declarations.keys()) {
        if (FIXED_TOKEN.test(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    expect([...counts].filter(([, count]) => count > 1)).toEqual([]);
  });
});

describe("token references", () => {
  const files = STYLED_ROOTS.flatMap(cssFilesUnder);

  it("finds the design system's stylesheets", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("only uses custom properties that exist", () => {
    const unknown: string[] = [];

    for (const file of files) {
      const css = stripComments(readFileSync(file, "utf8"));
      const local = new Set<string>();
      for (const block of parseCss(css)) {
        for (const name of block.declarations.keys()) local.add(name);
      }

      /* var(--name) and var(--name, fallback) — a fallback is a licence to
         reference a property the component itself does not declare. */
      for (const match of css.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
        const name = match[1];
        const hasFallback = match[2] === ",";
        if (name === undefined) continue;
        if (declaredTokens.has(name) || local.has(name) || hasFallback) continue;
        unknown.push(`${path.relative(repoRoot, file)}: ${name}`);
      }
    }

    expect(unknown, "every var() resolves to a Marginalia token").toEqual([]);
  });

  it("styles the muṣḥaf page from fixed tokens only", () => {
    const mushafCss = cssFilesUnder(path.join(designRoot, "ui/mushaf"));
    expect(mushafCss.length).toBeGreaterThan(0);

    for (const file of mushafCss) {
      /* InkLegend is chrome that EXPLAINS the page (onboarding), not the page
         itself: it is allowed the themed palette around its paper chips. */
      if (path.basename(file).startsWith("InkLegend")) continue;
      const css = stripComments(readFileSync(file, "utf8"));
      /* The page's own materials — paper, ink, rules, markers — may only come
         from the fixed family. A themed colour here would tint the page. */
      const forbidden = [...css.matchAll(/var\(\s*(--(?:surface|accent|milestone|danger|success|caution)[\w-]*)/g)];
      expect(
        forbidden.map((match) => `${path.basename(file)}: ${match[1]}`),
        "no themed colour may touch the page",
      ).toEqual([]);
    }
  });
});

describe("the type floor", () => {
  it("never steps below 12px, and never below 15px for children", () => {
    const tooSmall: string[] = [];

    for (const block of tokenBlocks) {
      const kids = block.chain.some((selector) => selector.includes('[data-tier="kids"]'));
      const floor = kids ? 15 : 12;
      for (const [name, value] of block.declarations) {
        if (!name.startsWith("--text-")) continue;
        const match = REM_OR_PX.exec(value);
        if (!match?.[1]) continue;
        const px = match[2] === "rem" ? Number(match[1]) * 16 : Number(match[1]);
        if (px < floor) tooSmall.push(`${name}: ${value} (${px}px < ${floor}px)`);
      }
    }

    expect(tooSmall, "nothing in Itqān is smaller than the floor").toEqual([]);
  });
});
