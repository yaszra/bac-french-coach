// Build-time hash check of the content package. Full gate suite lives in
// verify_content.mjs (run in CI on content changes); this fast check runs on
// every build and fails if the vendored content no longer matches its manifest.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const manifestPath = new URL("../content/MANIFEST.json", import.meta.url);
if (!existsSync(manifestPath)) {
  console.log("[content] no MANIFEST.json yet — content package not vendored; skipping hash check");
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
let failed = false;
for (const [rel, expected] of Object.entries(manifest.files ?? {})) {
  const p = new URL(`../${rel}`, import.meta.url);
  if (!existsSync(p)) { console.error(`[content] MISSING ${rel}`); failed = true; continue; }
  const actual = createHash("sha256").update(readFileSync(p)).digest("hex");
  if (actual !== expected) { console.error(`[content] HASH MISMATCH ${rel}`); failed = true; }
}
if (failed) { console.error("[content] content package integrity check FAILED"); process.exit(1); }
console.log(`[content] ${Object.keys(manifest.files ?? {}).length} files verified (package v${manifest.version})`);
