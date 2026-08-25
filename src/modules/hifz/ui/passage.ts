/**
 * From an assignment's scope to the units it actually contains, and back.
 *
 * An assignment carries REFERENCES only — `{ sura, ayahFrom, ayahTo }` — because
 * the sacred-content rule forbids Arabic in the database. This module turns those
 * references into unit ids (āyah bodies and the joins between them) and turns a
 * unit id back into the āyāt a screen has to load from the content package.
 *
 * The joins are first-class. `t:78:1>78:2` is a unit in its own right because the
 * seam between two āyāt is the part that actually breaks, and a curriculum that
 * only tracks bodies cannot see it fail.
 *
 * Pure: no clock, no I/O, no content. Nothing here reads or produces scripture.
 */

import { z } from "zod";
import {
  bodyUnitId,
  parseUnitId,
  transitionUnitId,
  type AyahRef,
  type UnitId,
  type UnitKind,
} from "@/modules/memory/domain/types";

/** An assignment's ḥifẓ scope, as it is stored. References only, strictly parsed. */
export const hifzScopeSchema = z.strictObject({
  sura: z.number().int().min(1).max(114),
  ayahFrom: z.number().int().min(1).max(999),
  ayahTo: z.number().int().min(1).max(999),
});

export type HifzScope = z.infer<typeof hifzScopeSchema>;

/** Parse a stored scope, or `null` when it is not a ḥifẓ range we understand. */
export function parseHifzScope(value: unknown): HifzScope | null {
  const parsed = hifzScopeSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.ayahTo < parsed.data.ayahFrom ? null : parsed.data;
}

export interface ScopeUnit {
  readonly unitId: UnitId;
  readonly kind: UnitKind;
  /** Curriculum order within the scope; lower comes first. */
  readonly order: number;
}

/**
 * Every unit in a scope, in the order they are learned.
 *
 * An āyah body comes before the join that leaves it, so a learner never meets a
 * seam before both of its ends: body 1, join 1→2, body 2, join 2→3, …
 */
export function unitsOfScope(scope: HifzScope, startOrder = 0): readonly ScopeUnit[] {
  const units: ScopeUnit[] = [];
  let order = startOrder;
  for (let ayah = scope.ayahFrom; ayah <= scope.ayahTo; ayah += 1) {
    const ref: AyahRef = { surah: scope.sura, ayah };
    units.push({ unitId: bodyUnitId(ref), kind: "ayah_body", order: order++ });
    if (ayah < scope.ayahTo) {
      const next: AyahRef = { surah: scope.sura, ayah: ayah + 1 };
      units.push({
        unitId: transitionUnitId(ref, next),
        kind: "ayah_transition",
        order: order++,
      });
    }
  }
  return units;
}

/** The units of several scopes, deduplicated, keeping the earliest order for each. */
export function unitsOfScopes(scopes: readonly HifzScope[]): readonly ScopeUnit[] {
  const byId = new Map<UnitId, ScopeUnit>();
  let order = 0;
  for (const scope of scopes) {
    for (const unit of unitsOfScope(scope, order)) {
      const existing = byId.get(unit.unitId);
      if (existing === undefined || unit.order < existing.order) byId.set(unit.unitId, unit);
      order = Math.max(order, unit.order + 1);
    }
  }
  return [...byId.values()].sort((left, right) => left.order - right.order);
}

/* ------------------------------------------------------- unit → what to show */

/**
 * The āyāt a unit is about.
 *
 * A body is one āyah. A join is two — you cannot practise a seam by looking at
 * one side of it. A page position and a reading concept are not āyāt at all, and
 * this returns an empty list rather than guessing at one.
 */
export function ayahsOfUnit(unitId: UnitId): readonly AyahRef[] {
  const parsed = parseUnitId(unitId);
  if (parsed === null) return [];
  switch (parsed.kind) {
    case "ayah_body":
      return [parsed.ayah];
    case "ayah_transition":
      return [parsed.from, parsed.to];
    case "page_position":
    case "reading_concept":
      return [];
  }
}

/** The āyah a unit is *anchored* to — what a page should scroll to. */
export function anchorAyahOf(unitId: UnitId): AyahRef | null {
  return ayahsOfUnit(unitId)[0] ?? null;
}

/**
 * A short, non-scripture label for a unit: `78:1` or `78:1 → 78:2`.
 *
 * Digits and an arrow. It is a reference, so it is safe to put in a DOM id, a
 * URL or a test selector, and it can never carry Arabic.
 */
export function unitReferenceLabel(unitId: UnitId): string | null {
  const parsed = parseUnitId(unitId);
  if (parsed === null) return null;
  switch (parsed.kind) {
    case "ayah_body":
      return `${parsed.ayah.surah}:${parsed.ayah.ayah}`;
    case "ayah_transition":
      return `${parsed.from.surah}:${parsed.from.ayah} → ${parsed.to.surah}:${parsed.to.ayah}`;
    case "page_position":
      return `${parsed.page}·${parsed.position}`;
    case "reading_concept":
      return parsed.conceptKey;
  }
}

/** The āyah after this one *within the same sūrah*, or `null` at its end. */
export function nextAyahInSurah(ref: AyahRef, surahLength: number | null): AyahRef | null {
  if (surahLength !== null && ref.ayah >= surahLength) return null;
  return { surah: ref.surah, ayah: ref.ayah + 1 };
}
