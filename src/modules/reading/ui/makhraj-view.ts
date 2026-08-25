/**
 * The alphabet, arranged the way it is actually taught: by where the sound is made.
 *
 * Hijāʾī order is an ordering of shapes. Makhraj order is an ordering of the mouth —
 * throat, tongue, lips, nose — and it is the one that explains why ṣād and sīn get
 * confused and why ḥāʾ and hāʾ do not sound alike however similar they look. This
 * module turns the lattice's makhraj data into that arrangement, and nothing else.
 *
 * Pure module: no I/O, no clock, no randomness.
 */

import {
  MAKHARIJ,
  MAKHRAJ_REGIONS,
  lettersOfMakhraj,
  type ArabicLetter,
  type MakhrajGroup,
  type MakhrajRegion,
} from "../domain/concepts";

export interface MakhrajPlace {
  readonly id: MakhrajGroup;
  readonly labelKey: string;
  readonly depth: number;
  readonly letters: readonly ArabicLetter[];
}

export interface MakhrajRegionView {
  readonly region: MakhrajRegion;
  readonly places: readonly MakhrajPlace[];
  /** Every letter in the region, in hijāʾī order. Its own denominator. */
  readonly letterCount: number;
}

/**
 * The seventeen places, grouped into their five regions, deepest first.
 *
 * A place with no letters of its own is kept, not dropped: al-jawf and al-khayshūm
 * are real articulation points that no single letter belongs to, and a page that
 * silently omitted them would teach an alphabet of fifteen makhārij.
 */
export function makhrajRegions(): readonly MakhrajRegionView[] {
  return MAKHRAJ_REGIONS.map((region) => {
    const places = MAKHARIJ.filter((definition) => definition.region === region)
      .slice()
      .sort((a, b) => a.depth - b.depth)
      .map((definition): MakhrajPlace => ({
        id: definition.id,
        labelKey: definition.labelKey,
        depth: definition.depth,
        letters: lettersOfMakhraj(definition.id),
      }));

    return {
      region,
      places,
      letterCount: places.reduce((total, place) => total + place.letters.length, 0),
    };
  });
}

/** Where one letter is made, for the intro animation's caption. */
export function placeOfLetter(letter: ArabicLetter): MakhrajPlace | null {
  const definition = MAKHARIJ.find((candidate) => candidate.id === letter.makhraj);
  if (definition === undefined) return null;
  return {
    id: definition.id,
    labelKey: definition.labelKey,
    depth: definition.depth,
    letters: lettersOfMakhraj(definition.id),
  };
}

/**
 * Where to draw the articulation point, as a fraction of the way from the back of
 * the mouth (0) to the lips (1), plus how high it sits.
 *
 * These are drawing coordinates for a schematic profile, derived from the classical
 * ordering — deepest makhraj furthest back — not anatomical measurements, and the
 * intro animation labels them with the makhraj's own name rather than a claim.
 */
export function articulationPoint(makhraj: MakhrajGroup): { readonly x: number; readonly y: number } {
  const definition = MAKHARIJ.find((candidate) => candidate.id === makhraj);
  if (definition === undefined) return { x: 0.5, y: 0.5 };

  const index = MAKHARIJ.indexOf(definition);
  const nasal = definition.region === "khayshum";
  const spread = Math.max(1, MAKHARIJ.length - 1);
  return {
    x: nasal ? 0.32 : 0.08 + (index / spread) * 0.84,
    y: nasal ? 0.2 : definition.region === "jawf" ? 0.5 : 0.62,
  };
}
