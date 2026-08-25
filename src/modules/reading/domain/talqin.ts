/**
 * Talqīn — resolving the model pronunciation a learner hears.
 *
 * Talqīn is the teacher saying it first, and the learner saying it back. When the
 * teacher is not in the room, something has to stand in their place, and *what*
 * stands in their place must always be visible. This module is the seam that decides.
 *
 * Precedence, in order: **teacher → studio → library → not yet recorded**.
 *
 * ## A machine voice is never a silent fallback
 *
 * There is no synthesized default beneath the library. When nothing has been
 * recorded, `resolveTalqin` returns `{ kind: "not_yet_recorded" }` — an honest,
 * renderable state — and the learner is offered a teacher, not an imitation of one.
 *
 * When a synthesized model *is* used, it is because a studio asset exists that a
 * named human reviewed and signed off, and it arrives labelled. The type makes this
 * structural rather than a convention:
 *
 * - `TalqinAsset` is a discriminated union on `provenance`, and every variant is a
 *   label. There is no member without one, so no code path — not a default parameter,
 *   not a spread, not a cast-free construction — can produce an unlabelled asset.
 * - The `studio_synth_reviewed` variant additionally *requires* `reviewedByPersonId`
 *   and `reviewedAt`. A machine voice that nobody signed cannot be represented.
 * - `TalqinResolution` carries `provenance` and `isMachineVoice` on the resolved
 *   branch, so a caller cannot render audio without having been told what it is.
 *
 * Pure module: no I/O, no clock, no randomness. Deterministic given the same inputs.
 */

import { reason, type Reason } from "@/modules/memory/domain/types";

import type { ConceptId } from "./concepts";

export const TALQIN_SOURCES = ["teacher", "studio", "library"] as const;
export type TalqinSource = (typeof TALQIN_SOURCES)[number];

/** The precedence walk. The learner's own teacher always wins. */
export const TALQIN_PRECEDENCE: readonly TalqinSource[] = ["teacher", "studio", "library"];

export const TALQIN_PROVENANCES = ["human", "studio_synth_reviewed", "library"] as const;
export type TalqinProvenance = (typeof TALQIN_PROVENANCES)[number];

interface TalqinAssetBase {
  readonly assetId: string;
  readonly conceptId: ConceptId;
  /** Which shelf of the precedence walk this asset sits on. */
  readonly source: TalqinSource;
  readonly recordedAt: Date;
  readonly durationMs: number;
  /** BCP-47 tag, when the model is language-specific. */
  readonly locale?: string;
  /** The teacher this asset belongs to, for `source: "teacher"`. */
  readonly teacherId?: string;
}

/**
 * A model pronunciation, always labelled.
 *
 * - `human` — a person said it. `recordedByPersonId` names who.
 * - `studio_synth_reviewed` — a synthesized model that a named human listened to and
 *   approved. Both the reviewer and the review time are required.
 * - `library` — a curated recording attributed to a real reciter.
 */
export type TalqinAsset =
  | (TalqinAssetBase & {
      readonly provenance: "human";
      readonly recordedByPersonId: string;
    })
  | (TalqinAssetBase & {
      readonly provenance: "studio_synth_reviewed";
      readonly reviewedByPersonId: string;
      readonly reviewedAt: Date;
    })
  | (TalqinAssetBase & {
      readonly provenance: "library";
      readonly libraryId: string;
      readonly reciterId: string;
    });

/** True for a synthesized model voice. Reviewed, signed — and still not a human. */
export function isMachineVoice(asset: TalqinAsset): boolean {
  return asset.provenance === "studio_synth_reviewed";
}

/**
 * The i18n key naming an asset's provenance. The `never` branch is an exhaustiveness
 * guard: adding a provenance without a label would fail to compile here.
 */
export function talqinProvenanceLabelKey(provenance: TalqinProvenance): string {
  switch (provenance) {
    case "human":
      return "reading.talqin.provenance.human";
    case "studio_synth_reviewed":
      return "reading.talqin.provenance.studio_synth_reviewed";
    case "library":
      return "reading.talqin.provenance.library";
    default: {
      const exhaustive: never = provenance;
      return exhaustive;
    }
  }
}

export interface TalqinRequest {
  readonly conceptId: ConceptId;
  readonly learnerId?: string;
  /** When the learner has a teacher, only that teacher's assets count as `teacher`. */
  readonly teacherId?: string;
  readonly locale?: string;
  /**
   * Provenances this tenant permits. Omit for all three. A school that will not play
   * synthesized audio to children passes `["human", "library"]`, and the resolution
   * falls through to `not_yet_recorded` rather than quietly substituting one.
   */
  readonly allowedProvenance?: readonly TalqinProvenance[];
}

export type TalqinResolution =
  | {
      readonly kind: "resolved";
      readonly asset: TalqinAsset;
      readonly source: TalqinSource;
      /** Always present on a resolved asset. There is no unlabelled branch. */
      readonly provenance: TalqinProvenance;
      readonly isMachineVoice: boolean;
      /** The i18n key the UI must show alongside the audio. */
      readonly provenanceLabelKey: string;
      readonly precedence: readonly TalqinSource[];
      /** Sources looked at before this one matched, in order. */
      readonly searched: readonly TalqinSource[];
      readonly reason: Reason;
    }
  | {
      readonly kind: "not_yet_recorded";
      readonly conceptId: ConceptId;
      readonly searched: readonly TalqinSource[];
      readonly reason: Reason;
    };

function localeMatches(request: TalqinRequest, asset: TalqinAsset): boolean {
  if (request.locale === undefined) return true;
  if (asset.locale === undefined) return true;
  return asset.locale === request.locale;
}

/** Prefer an exact locale match, then the newest recording, then the lowest id. */
function pickBest(
  request: TalqinRequest,
  candidates: readonly TalqinAsset[],
): TalqinAsset | null {
  if (candidates.length === 0) return null;
  const ranked = [...candidates].sort((a, b) => {
    const aExact = request.locale !== undefined && a.locale === request.locale ? 1 : 0;
    const bExact = request.locale !== undefined && b.locale === request.locale ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    const byTime = b.recordedAt.getTime() - a.recordedAt.getTime();
    if (byTime !== 0) return byTime;
    return a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0;
  });
  return ranked[0] ?? null;
}

/**
 * Walk the precedence chain and return the model the learner should hear, or the
 * honest absence of one.
 *
 * `available` is whatever the caller has already fetched; this function performs no
 * I/O and never invents an asset.
 */
export function resolveTalqin(
  request: TalqinRequest,
  available: readonly TalqinAsset[],
): TalqinResolution {
  const allowed = new Set<TalqinProvenance>(request.allowedProvenance ?? TALQIN_PROVENANCES);
  const searched: TalqinSource[] = [];

  for (const source of TALQIN_PRECEDENCE) {
    searched.push(source);
    const candidates = available.filter((asset) => {
      if (asset.conceptId !== request.conceptId) return false;
      if (asset.source !== source) return false;
      if (!allowed.has(asset.provenance)) return false;
      if (!localeMatches(request, asset)) return false;
      // A teacher asset belongs to a teacher: another teacher's recording is not
      // this learner's teacher, and falls through to the studio shelf instead.
      if (source === "teacher" && request.teacherId !== undefined) {
        return asset.teacherId === request.teacherId;
      }
      return true;
    });

    const best = pickBest(request, candidates);
    if (best === null) continue;

    return {
      kind: "resolved",
      asset: best,
      source,
      provenance: best.provenance,
      isMachineVoice: isMachineVoice(best),
      provenanceLabelKey: talqinProvenanceLabelKey(best.provenance),
      precedence: TALQIN_PRECEDENCE,
      searched: [...searched],
      reason: reason("reading.talqin.reason.resolved", {
        conceptId: request.conceptId,
        source,
        provenance: best.provenance,
        assetId: best.assetId,
      }),
    };
  }

  // Nothing on any shelf. This is a state, not an error, and it is where the product
  // offers a teacher — never a synthesized stand-in.
  return {
    kind: "not_yet_recorded",
    conceptId: request.conceptId,
    searched: [...searched],
    reason: reason("reading.talqin.reason.not_yet_recorded", {
      conceptId: request.conceptId,
      searched: searched.join(","),
    }),
  };
}
