#!/usr/bin/env node
/**
 * Build content/MANIFEST.json — a digest of every vendored content file.
 *
 * The full gate suite runs in CI when content changes. This manifest is what
 * makes the FAST check possible on every single build: one hash per file,
 * compared in milliseconds, so a corpus that drifted cannot ship even when
 * nobody thought to run the gates.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const CONTENT = path.join(ROOT, "content");

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name !== "MANIFEST.json") yield full;
  }
}

const files = {};
for await (const file of walk(CONTENT)) {
  const relative = path.relative(ROOT, file).split(path.sep).join("/");
  files[relative] = createHash("sha256").update(await readFile(file)).digest("hex");
}

const ordered = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(
  path.join(CONTENT, "MANIFEST.json"),
  JSON.stringify({ version: "0.1.0", generatedAt: new Date().toISOString().slice(0, 10), files: ordered }, null, 2) + "\n",
  "utf8",
);
console.log(`[manifest] ${Object.keys(ordered).length} content files digested`);
