/**
 * Fixture tripwire.
 *
 * The rule "never retype Qur'anic strings into fixtures or components" is
 * worthless as prose. This makes it a build failure: any Arabic-script
 * character appearing in source outside an explicit allowlist fails CI.
 *
 * It is intentionally blunt. A false positive costs a developer one
 * allowlist entry and a code review; a false negative puts an unverified
 * āyah in front of a child.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Arabic script ranges, including presentation forms. */
const ARABIC =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Paths permitted to contain Arabic script, relative to the scan root.
 *
 * - `src/config/brand.ts` holds the Arabic brand name, which is reviewed
 *   through the brand process, not the corpus process.
 * - `src/content/approved/` is the only place verified corpus data may be
 *   vendored, and it is verified by checksum and approval, not by reading.
 */
export const DEFAULT_ALLOWLIST: readonly string[] = [
  "src/config/brand.ts",
  "src/content/approved/",
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html"];

export interface TripwireHit {
  file: string;
  line: number;
  /** The offending characters only — never the surrounding text. */
  sample: string;
}

function walk(dir: string, root: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, root, out);
    else if (SCANNED_EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full);
  }
}

function isAllowed(relPath: string, allowlist: readonly string[]): boolean {
  const normalized = relPath.split(sep).join("/");
  return allowlist.some((a) =>
    a.endsWith("/") ? normalized.startsWith(a) : normalized === a,
  );
}

/**
 * Scan a directory tree. Returns every hit rather than the first, so a
 * developer fixes the whole problem in one pass.
 */
export function scanForArabicScript(
  root: string,
  scanDir: string = join(root, "src"),
  allowlist: readonly string[] = DEFAULT_ALLOWLIST,
): TripwireHit[] {
  const files: string[] = [];
  try {
    walk(scanDir, root, files);
  } catch {
    return [];
  }

  const hits: TripwireHit[] = [];
  for (const file of files) {
    const rel = relative(root, file);
    if (isAllowed(rel, allowlist)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      if (!ARABIC.test(text)) return;
      const matched = [...text].filter((ch) => ARABIC.test(ch)).join("");
      hits.push({
        file: rel.split(sep).join("/"),
        line: i + 1,
        sample: matched.slice(0, 24),
      });
    });
  }
  return hits;
}

/** True when a string contains any Arabic-script character. */
export function containsArabicScript(value: string): boolean {
  return ARABIC.test(value);
}

/**
 * Guard for anything crossing an outward boundary — logs, analytics
 * events, notification previews, error messages.
 */
export function assertNoSacredText(value: string, context: string): void {
  if (containsArabicScript(value))
    throw new Error(
      `Refusing to emit Arabic script through ${context}: sacred text must never leave the content boundary.`,
    );
}
