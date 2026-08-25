/**
 * Finding a model pronunciation.
 *
 * Talqīn is a human being saying a letter so a learner can copy it. This module finds
 * the recordings that exist; `resolveTalqin` decides which one is heard, and labels
 * it. Nothing here synthesises audio, and nothing here reaches a learner unlabelled —
 * an asset whose provenance the database does not record is skipped rather than
 * played, because unlabelled audio is exactly what the platform promises never to
 * play.
 *
 * ## How an asset says which concept it belongs to
 *
 * Audio bytes are content-addressed in object storage and the row carries the key,
 * not a concept column. The key is therefore the join, and it has one shape:
 *
 *     talqin/<source>/<conceptId>[/<anything>]
 *
 * A key that does not match teaches nothing about any concept and is ignored. When
 * no key matches, the resolution is `not_yet_recorded` — a state the screen renders
 * honestly and answers with an offer to ask a teacher.
 */

import { withTenant, type TenantClient } from "../../platform/db/tenant";
import { isConceptId, type ConceptId } from "../domain/concepts";
import type { TalqinAsset, TalqinProvenance, TalqinSource } from "../domain/talqin";

const KEY_RE = /^talqin\/(teacher|studio|library)\/([a-z0-9._]+)(?:\/|$)/;

interface AudioAssetRow {
  readonly id: string;
  readonly objectKey: string;
  readonly provenance: string;
  readonly durationMs: number | null;
  readonly createdAt: Date;
  readonly reciterId: string | null;
  readonly narratorId: string | null;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
}

export interface TalqinKeyParts {
  readonly source: TalqinSource;
  readonly conceptId: ConceptId;
}

export function parseTalqinKey(objectKey: string): TalqinKeyParts | null {
  const match = KEY_RE.exec(objectKey);
  if (match === null) return null;
  const [, source, conceptId] = match;
  if (source === undefined || conceptId === undefined) return null;
  if (!isConceptId(conceptId)) return null;
  return { source: source as TalqinSource, conceptId };
}

const PROVENANCE: Readonly<Record<string, TalqinProvenance>> = {
  human: "human",
  studio_synth: "studio_synth_reviewed",
  library: "library",
};

/**
 * Turn one stored row into a talqīn asset, or nothing.
 *
 * The discriminated union is doing real work here: a synthesized model with no named
 * reviewer is not representable, so a row that lost its review cannot be built, and
 * therefore cannot be played.
 */
export function toTalqinAsset(row: AudioAssetRow): TalqinAsset | null {
  const parts = parseTalqinKey(row.objectKey);
  if (parts === null) return null;
  const provenance = PROVENANCE[row.provenance];
  if (provenance === undefined) return null;

  const base = {
    assetId: row.id,
    conceptId: parts.conceptId,
    source: parts.source,
    recordedAt: row.createdAt,
    durationMs: row.durationMs ?? 1,
  };

  if (provenance === "human") {
    if (row.narratorId === null) return null;
    return {
      ...base,
      provenance: "human",
      recordedByPersonId: row.narratorId,
      ...(parts.source === "teacher" ? { teacherId: row.narratorId } : {}),
    };
  }

  if (provenance === "studio_synth_reviewed") {
    if (row.reviewedBy === null || row.reviewedAt === null) return null;
    return {
      ...base,
      provenance: "studio_synth_reviewed",
      reviewedByPersonId: row.reviewedBy,
      reviewedAt: row.reviewedAt,
    };
  }

  if (row.reciterId === null) return null;
  return {
    ...base,
    provenance: "library",
    libraryId: row.objectKey,
    reciterId: row.reciterId,
  };
}

export interface TalqinLibrary {
  readonly assets: readonly TalqinAsset[];
  /** Where each asset's bytes are served from, by asset id. */
  readonly srcById: ReadonlyMap<string, string>;
}

export const EMPTY_TALQIN_LIBRARY: TalqinLibrary = { assets: [], srcById: new Map() };

/** The media URL for one stored object. The bytes never travel through a payload. */
export function talqinSrc(objectKey: string): string {
  return `/api/audio/${encodeURIComponent(objectKey)}`;
}

/** Approved talqīn assets for the concepts asked about. Never pending audio. */
export async function talqinAssetsFor(
  organizationId: string,
  conceptIds: readonly ConceptId[],
  tx?: TenantClient,
): Promise<TalqinLibrary> {
  if (conceptIds.length === 0) return EMPTY_TALQIN_LIBRARY;
  const read = async (client: TenantClient): Promise<TalqinLibrary> => {
    const rows = await client.audioAsset.findMany({
      where: { approval: "approved", objectKey: { startsWith: "talqin/" } },
      select: {
        id: true,
        objectKey: true,
        provenance: true,
        durationMs: true,
        createdAt: true,
        reciterId: true,
        narratorId: true,
        reviewedBy: true,
        reviewedAt: true,
      },
      take: 500,
    });
    const wanted = new Set(conceptIds);
    const assets: TalqinAsset[] = [];
    const srcById = new Map<string, string>();
    for (const row of rows) {
      const asset = toTalqinAsset(row as AudioAssetRow);
      if (asset === null || !wanted.has(asset.conceptId)) continue;
      assets.push(asset);
      srcById.set(asset.assetId, talqinSrc(row.objectKey));
    }
    return { assets, srcById };
  };
  return tx ? read(tx) : withTenant(organizationId, read);
}
