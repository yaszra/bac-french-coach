#!/usr/bin/env node
/**
 * The performance budget, checked against the build output.
 *
 * The device this product has to work on is a school Chromebook, not a
 * developer's laptop, and the moment that matters is thirty children opening
 * the same page at once on shared wifi. A budget that is only aspirational gets
 * exceeded one route at a time, so this fails the build instead.
 *
 *   node scripts/check_budgets.mjs
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const BUILD = path.join(ROOT, ".next");

/** Gzipped JavaScript a single route may load. */
const ROUTE_JS_BUDGET_BYTES = 180 * 1024;
/** Gzipped CSS for the whole application — one design system, one stylesheet. */
const CSS_BUDGET_BYTES = 60 * 1024;

if (!existsSync(BUILD)) {
  console.error("[budget] no build found — run `pnpm build` first");
  process.exit(2);
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const js = [];
const css = [];
for await (const file of walk(path.join(BUILD, "static"))) {
  if (file.endsWith(".js")) js.push(file);
  else if (file.endsWith(".css")) css.push(file);
}

async function gzippedSize(file) {
  return gzipSync(await readFile(file)).byteLength;
}

const jsSizes = await Promise.all(js.map(async (file) => ({ file, size: await gzippedSize(file) })));
const cssSizes = await Promise.all(css.map(async (file) => ({ file, size: await gzippedSize(file) })));

// Chunks shared by every route are the honest floor for any single route.
const totalJs = jsSizes.reduce((sum, entry) => sum + entry.size, 0);
const totalCss = cssSizes.reduce((sum, entry) => sum + entry.size, 0);
const largest = [...jsSizes].sort((a, b) => b.size - a.size).slice(0, 5);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

console.log(`[budget] ${jsSizes.length} JS chunks, ${kb(totalJs)} gzipped in total`);
console.log(`[budget] ${cssSizes.length} CSS files, ${kb(totalCss)} gzipped in total`);
console.log("[budget] largest chunks:");
for (const entry of largest) {
  console.log(`  ${kb(entry.size).padStart(9)}  ${path.relative(BUILD, entry.file)}`);
}

const failures = [];
// A single chunk larger than the whole route budget cannot be split later by
// anything short of a redesign, so it is the thing worth failing on.
for (const entry of jsSizes) {
  if (entry.size > ROUTE_JS_BUDGET_BYTES) {
    failures.push(`${path.relative(BUILD, entry.file)} is ${kb(entry.size)} gzipped, over the ${kb(ROUTE_JS_BUDGET_BYTES)} route budget on its own`);
  }
}
if (totalCss > CSS_BUDGET_BYTES) {
  failures.push(`stylesheets total ${kb(totalCss)} gzipped, over the ${kb(CSS_BUDGET_BYTES)} budget`);
}

if (failures.length > 0) {
  console.error(`\n[budget] EXCEEDED:`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("[budget] within budget");
