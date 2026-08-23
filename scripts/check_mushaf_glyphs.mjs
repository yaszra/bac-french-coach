/**
 * Prove that every codepoint in the vendored corpus has a glyph in the muṣḥaf
 * face the application actually ships.
 *
 * This exists because of a real defect: the fonts were installed as packages
 * but never imported, so the muṣḥaf rendered in a generic system serif and
 * showed empty boxes in the middle of scripture. Every test passed. Only
 * looking at the page found it.
 *
 * A missing mark is not a cosmetic bug on this page — it is a learner
 * memorising an incomplete word. So the check is mechanical and runs in CI.
 *
 *   node scripts/check_mushaf_glyphs.mjs
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const CORPUS = "content/quran/quran-uthmani.json";
const FONT_CSS = "src/modules/design/tokens/fonts.css";
const EXECUTABLE = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

async function main() {
  const verses = JSON.parse(readFileSync(CORPUS, "utf8"));
  const counts = new Map();
  for (const verse of verses) {
    for (const character of verse.text) {
      const cp = character.codePointAt(0);
      counts.set(cp, (counts.get(cp) ?? 0) + 1);
    }
  }
  const codepoints = [...counts.keys()].sort((a, b) => a - b);

  // The face under test is the vendored fallback — the one most environments
  // will actually render, since KFGQPC is licensed and installed at deploy.
  const fontFiles = JSON.parse(readFileSync("node_modules/@fontsource/amiri-quran/package.json", "utf8"));
  const fontUrl = new URL(
    "../node_modules/@fontsource/amiri-quran/files/amiri-quran-arabic-400-normal.woff2",
    import.meta.url,
  );

  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const page = await browser.newPage();
  const woff2 = readFileSync(fontUrl).toString("base64");

  await page.setContent(`<!doctype html><meta charset="utf-8"><body></body>`);
  const missing = await page.evaluate(
    async ({ cps, font }) => {
      const face = new FontFace("MushafUnderTest", `url(data:font/woff2;base64,${font}) format("woff2")`);
      await face.load();
      document.fonts.add(face);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const size = 64;

      /**
       * Render each codepoint alone in the face under test and compare its ink
       * with the same codepoint rendered in a face that certainly lacks it.
       * Combining marks have no advance width, so width comparison is useless;
       * counting non-transparent pixels is not.
       */
      const inkOf = function (text, family) {
        canvas.width = size * 3;
        canvas.height = size * 3;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = `${size}px ${family}`;
        ctx.fillStyle = "#000";
        ctx.textBaseline = "middle";
        // A carrier letter, so a combining mark has something to sit on.
        ctx.fillText(text, size / 2, size * 1.5);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let ink = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 8) ink++;
        return ink;
      };

      const out = [];
      for (const cp of cps) {
        const ch = String.fromCodePoint(cp);
        if (ch === " " || cp === 0x200f) continue;
        const carrier = "ـ"; // taṭwīl, present in every Arabic face
        const withMark = inkOf(carrier + ch, "MushafUnderTest");
        const carrierOnly = inkOf(carrier, "MushafUnderTest");
        // A codepoint the face lacks adds no ink beyond the carrier (or adds
        // exactly the .notdef box, which is far more ink than any mark).
        if (withMark === carrierOnly) out.push(cp);
      }
      return out;
    },
    { cps: codepoints, font: woff2 },
  );

  await browser.close();

  console.log(
    `[glyphs] corpus uses ${codepoints.length} distinct codepoints; ` +
      `checked against Amiri Quran ${fontFiles.version} (${FONT_CSS})`,
  );

  if (missing.length > 0) {
    console.error(`\n[glyphs] FAILED — ${missing.length} codepoint(s) have no glyph in the shipped muṣḥaf face:`);
    for (const cp of missing) {
      const hex = cp.toString(16).toUpperCase().padStart(4, "0");
      console.error(`  ✗ U+${hex} — ${counts.get(cp)} occurrences in the corpus`);
    }
    console.error(
      "\n  A missing mark renders as an empty box inside scripture. Either ship a face\n" +
        "  that covers the vendored edition, or vendor an edition the shipped face covers.",
    );
    process.exit(1);
  }
  console.log("[glyphs] every corpus codepoint has a glyph");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
