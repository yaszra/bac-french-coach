/**
 * Bundle budget check.
 *
 * docs/12 declares under 200 KB compressed for a learner route's initial
 * JavaScript, excluding route-lazy media libraries. A budget that is only
 * written down is an aspiration; this makes it a build failure.
 *
 * Sizes are gzipped, because that is what the learner's connection
 * actually carries, and a learner on a cheap Android over mobile data is
 * the population this product is for.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const BUDGETS = {
  /** Initial JS for a learner route, gzipped. */
  learnerRouteKb: 200,
  /** Shared chunks every route pays for. */
  sharedKb: 160,
};

const BUILD = ".next";
const APP_CHUNKS = join(BUILD, "static", "chunks", "app");

if (!existsSync(join(BUILD, "build-manifest.json"))) {
  console.error("No build output found. Run `npm run build` first.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(BUILD, "build-manifest.json"), "utf8"));

const gzipKb = (path) => gzipSync(readFileSync(path)).length / 1024;

/**
 * Chunks loaded on every route: framework, runtime, and the app shell.
 *
 * `polyfillFiles` is deliberately excluded. Next serves it with `nomodule`,
 * so a modern browser downloads nothing and parses nothing from it —
 * counting it would overstate what the target device actually pays. It is
 * reported separately below so it does not become invisible.
 */
const sharedKb = manifest.rootMainFiles
  .map((f) => join(BUILD, f))
  .filter((f) => existsSync(f))
  .reduce((total, f) => total + gzipKb(f), 0);

const legacyPolyfillKb = manifest.polyfillFiles
  .map((f) => join(BUILD, f))
  .filter((f) => existsSync(f))
  .reduce((total, f) => total + gzipKb(f), 0);

/** Walk the per-route chunk tree and group by route directory. */
function routeChunks(dir, route = "", out = new Map()) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      routeChunks(full, `${route}/${entry}`, out);
    } else if (entry.endsWith(".js")) {
      const key = route || "/";
      out.set(key, (out.get(key) ?? 0) + gzipKb(full));
    }
  }
  return out;
}

const routes = existsSync(APP_CHUNKS) ? routeChunks(APP_CHUNKS) : new Map();
const failures = [];
const rows = [];

for (const [route, ownKb] of routes) {
  // Initial JS is the shared shell plus this route's own chunks.
  const initialKb = sharedKb + ownKb;
  rows.push([route, ownKb, initialKb]);
  if (route.startsWith("/learn") && initialKb > BUDGETS.learnerRouteKb)
    failures.push(
      `${route}: ${initialKb.toFixed(1)} KB initial JS exceeds ${BUDGETS.learnerRouteKb} KB`,
    );
}

if (sharedKb > BUDGETS.sharedKb)
  failures.push(
    `shared chunks: ${sharedKb.toFixed(1)} KB exceeds ${BUDGETS.sharedKb} KB`,
  );

rows.sort((a, b) => b[2] - a[2]);
console.log("  route own      initial   route");
for (const [route, own, initial] of rows)
  console.log(
    `  ${own.toFixed(1).padStart(8)} KB ${initial.toFixed(1).padStart(8)} KB  ${route}`,
  );
console.log(`  ${sharedKb.toFixed(1).padStart(8)} KB              (shared shell)`);
console.log(
  `  ${legacyPolyfillKb.toFixed(1).padStart(8)} KB              (legacy polyfills, nomodule — not counted)`,
);
console.log(`\n  budgets: learner route < ${BUDGETS.learnerRouteKb} KB, shared < ${BUDGETS.sharedKb} KB (gzipped)`);

if (failures.length > 0) {
  console.error("\nBundle budget exceeded:");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("\n  All routes within budget.");
