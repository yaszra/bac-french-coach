/**
 * Reconcile two integrity snapshots and report.
 *
 * Thin wrapper around the pure reconciler, so the drill script and the
 * integration test apply identical rules.
 */
import { readFileSync } from "node:fs";
// Node strips the types at load; no build step, so the drill and the test
// run literally the same module.
import { reconcile } from "../src/application/reconciliation.ts";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error("usage: reconcile.mjs <before.json> <after.json>");
  process.exit(2);
}

const parse = (path) => JSON.parse(readFileSync(path, "utf8"));
const result = reconcile(parse(beforePath), parse(afterPath));

for (const issue of result.issues)
  console.error(`  [${issue.severity}] ${issue.code}: ${issue.detail}`);

console.log(`\n  ${result.summary}`);
process.exit(result.ok ? 0 : 1);
