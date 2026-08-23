import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Is there a real recitation for this passage?
 *
 * Recitation audio comes only from real reciters, and only from assets recorded
 * in `content/audio/registry.json` with their provenance. An asset with no entry
 * is never played — there is no fallback to synthesis, and no silent stand-in.
 *
 * Today the registry is empty, so this returns `not_yet_recorded` for everything.
 * That is the truth, and the interface says it out loud rather than showing a
 * play button that does nothing.
 */
export type AudioAvailability =
  | { readonly kind: "not_yet_recorded"; readonly reason: "no_assets" | "no_registry" }
  | { readonly kind: "available"; readonly src: string; readonly durationMs: number | null };

type RegistryAsset = {
  readonly reciterId?: string;
  readonly sura?: number;
  readonly ayah?: number;
  readonly objectKey?: string;
  readonly durationMs?: number;
  readonly approval?: string;
};

const REGISTRY_PATH = path.join(process.cwd(), "content", "audio", "registry.json");

let cache: readonly RegistryAsset[] | null = null;
let registryPresent = true;

function registry(): readonly RegistryAsset[] {
  if (cache !== null) return cache;
  if (!existsSync(REGISTRY_PATH)) {
    registryPresent = false;
    cache = [];
    return cache;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
    const assets =
      typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { assets?: unknown }).assets)
        ? ((parsed as { assets: RegistryAsset[] }).assets)
        : [];
    cache = assets;
    return cache;
  } catch {
    // A corrupt registry is "nothing approved", never "play it anyway".
    registryPresent = false;
    cache = [];
    return cache;
  }
}

export function ayahAudio(reciterId: string, sura: number, ayah: number): AudioAvailability {
  const assets = registry();
  const match = assets.find(
    (asset) =>
      asset.reciterId === reciterId &&
      asset.sura === sura &&
      asset.ayah === ayah &&
      asset.approval === "approved" &&
      typeof asset.objectKey === "string",
  );
  if (match === undefined || typeof match.objectKey !== "string") {
    return { kind: "not_yet_recorded", reason: registryPresent ? "no_assets" : "no_registry" };
  }
  return {
    kind: "available",
    src: `/api/audio/${encodeURIComponent(match.objectKey)}`,
    durationMs: typeof match.durationMs === "number" ? match.durationMs : null,
  };
}

/**
 * Measured word timings for a passage.
 *
 * `content/timings/STATUS.json` records every reciter as `not_yet_recorded`, so
 * this returns an empty list and the player runs with NO highlight. A highlight
 * derived by dividing a duration by a word count drifts, and a drifting highlight
 * teaches the wrong rhythm — so there is deliberately no interpolation path here.
 */
export function ayahTimings(): readonly [] {
  return [];
}
