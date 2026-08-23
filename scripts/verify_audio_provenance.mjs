#!/usr/bin/env node
/**
 * THE AUDIO PROVENANCE GATE.
 *
 * Recitation is a human act. This gate exists so that no synthesized voice can
 * ever reach a learner while pretending to be a reciter, and so that every
 * second of audio the product plays can be traced to a person and a licence.
 *
 * Three provenances, and no fourth:
 *   human                  — a real reciter or teacher recorded it.
 *   studio_synth_reviewed  — synthesized for talqīn, and a human approved it.
 *   library                — a licensed library asset.
 *
 * There is deliberately no "unknown" and no default. An asset without
 * provenance is not an asset with weaker provenance; it is a build failure.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const REGISTRY_PATH = path.join(ROOT, "content", "audio", "registry.json");

const PROVENANCES = new Set(["human", "studio_synth_reviewed", "library"]);
const APPROVALS = new Set(["approved", "pending", "rejected"]);

const failures = [];
const fail = (message) => failures.push(message);

async function main() {
  if (!existsSync(REGISTRY_PATH)) {
    fail("content/audio/registry.json is missing — the product would have no record of what it plays");
    report();
    return;
  }

  const registry = JSON.parse(await readFile(REGISTRY_PATH, "utf8"));
  const assets = registry.assets ?? [];
  const keys = new Set();

  for (const [index, asset] of assets.entries()) {
    const label = asset.id ?? `#${index}`;

    if (!asset.id) fail(`asset ${label}: missing id`);
    if (!asset.objectKey) fail(`asset ${label}: missing objectKey — bytes live in object storage`);
    if (asset.objectKey && keys.has(asset.objectKey)) fail(`asset ${label}: duplicate objectKey`);
    keys.add(asset.objectKey);

    if (!asset.sha256 || !/^[0-9a-f]{64}$/.test(asset.sha256)) {
      fail(`asset ${label}: missing or malformed sha256`);
    }

    if (!PROVENANCES.has(asset.provenance)) {
      fail(
        `asset ${label}: provenance "${asset.provenance ?? "(none)"}" is not one of ${[...PROVENANCES].join(", ")}. ` +
          `Synthesis is never unlabelled.`,
      );
    }

    if (asset.provenance === "human" && !asset.reciterId && !asset.narratorId) {
      fail(`asset ${label}: human audio must name the reciter or narrator`);
    }
    if (asset.provenance === "studio_synth_reviewed") {
      if (!asset.reviewedBy || !asset.reviewedAt) {
        fail(`asset ${label}: synthesized audio must record who reviewed it and when — that is what makes it usable`);
      }
      if (asset.approval !== "approved") {
        fail(`asset ${label}: synthesized audio may only ship once approved`);
      }
    }
    if (asset.provenance === "library" && !asset.license) {
      fail(`asset ${label}: library audio must record its licence`);
    }
    if (!APPROVALS.has(asset.approval)) {
      fail(`asset ${label}: approval "${asset.approval ?? "(none)"}" is not a known state`);
    }

    // Anything recorded by a child carries a purge date, always.
    if (asset.kind === "learner_recording" && !asset.purgeAfter) {
      fail(`asset ${label}: a learner recording must carry a purge date`);
    }
  }

  console.log(`[audio] ${assets.length} asset(s) checked`);
  report();
}

function report() {
  if (failures.length > 0) {
    console.error(`\n[audio] GATE FAILED — ${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log("[audio] gate passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
