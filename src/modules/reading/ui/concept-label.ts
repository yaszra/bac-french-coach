/**
 * Naming a concept on screen.
 *
 * There are 259 concepts in the lattice and there will never be 259 authored
 * strings for them: a name is *composed* from the parts a concept id already
 * decomposes into. `letter.beh.fathah` is "bāʾ with fatḥah" in English and
 * "الباء مع الفتحة" in Arabic, built from three keys that both bundles carry.
 *
 * Every string on this path is a message key. Nothing here returns a literal, and
 * nothing here returns an Arabic letter — the codepoints a screen shows come from the
 * lattice's `letterCodepoints`, which is teaching data, not copy.
 *
 * Pure module: no I/O, no clock, no randomness.
 */

import type { Translate } from "@/modules/platform/i18n/translate";

import { conceptById, makhrajById, type ConceptId, type MakhrajGroup } from "../domain/concepts";
import { facetsOf } from "../domain/confusion";

/**
 * Resolve one label key.
 *
 * A concept id can be both a name and a namespace — `tanwin` is a concept, and
 * `tanwin.fath` is one of its three — and a nested message bundle cannot hold a string
 * and an object at the same path. The convention is that such a concept keeps its own
 * name under `.name`, and this is the single place that knows it. A key that resolves
 * to nothing comes back as itself, which is visible in review rather than silent.
 */
export function label(t: Translate, key: string): string {
  const direct = t(key);
  if (direct !== key) return direct;
  const named = t(`${key}.name`);
  return named === `${key}.name` ? key : named;
}

/** The name of a bare letter, e.g. `reading.concept.letter.beh`. */
export function letterLabelKey(letterId: ConceptId): string {
  return `reading.concept.${letterId}`;
}

export function harakahLabelKey(harakahId: string): string {
  return `reading.concept.${harakahId}`;
}

export function formLabelKey(form: string): string {
  return `reading.concept.form.${form}`;
}

export function makhrajLabel(t: Translate, makhraj: MakhrajGroup): string {
  const definition = makhrajById(makhraj);
  return definition === null ? t("reading.makhraj.unknown") : label(t, definition.labelKey);
}

export function regionLabel(t: Translate, region: string): string {
  return t(`reading.region.${region}`);
}

/**
 * The learner-facing name of any concept in the lattice.
 *
 * Composed where a concept is composed, authored where it is atomic, and — for an id
 * this build has never heard of — the concept's own label key, which renders as the
 * key itself rather than as a confident lie.
 */
export function conceptLabel(t: Translate, conceptId: ConceptId): string {
  const facets = facetsOf(conceptId);
  const concept = conceptById(conceptId);

  if (facets.letter !== null && facets.harakah !== null) {
    return t("reading.label.letterHarakah", {
      letter: label(t, letterLabelKey(facets.letter.id)),
      harakah: label(t, harakahLabelKey(facets.harakah)),
    });
  }

  if (facets.letter !== null && facets.form !== null) {
    return t("reading.label.letterForm", {
      letter: label(t, letterLabelKey(facets.letter.id)),
      form: label(t, formLabelKey(facets.form)),
    });
  }

  if (facets.letter !== null) return label(t, letterLabelKey(facets.letter.id));
  if (concept !== null) return label(t, concept.labelKey);
  return label(t, `reading.concept.${conceptId}`);
}

/**
 * The codepoints a concept shows, as one printable string.
 *
 * A letter, or a letter carrying one mark. Never more: the schema layer admits single
 * codepoints only, and a screen composing more than one letter would be composing a
 * word (sacred-content rule).
 */
export function conceptGlyph(conceptId: ConceptId): string {
  return (conceptById(conceptId)?.letterCodepoints ?? []).join("");
}
