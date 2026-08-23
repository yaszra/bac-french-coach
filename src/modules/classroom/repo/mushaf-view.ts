import { getAyahRange, getPage, pageOf } from "../../content/domain/loader";
import { toInkDepth, type MushafLine, type MushafWord } from "../../design/ui/mushaf";
import { getStates } from "../../memory/repo/memory-state-repo";
import type { UnitId } from "../../memory/domain/types";

/**
 * Turning a reference into a page a teacher can look at.
 *
 * SACRED-CONTENT RULE: every Arabic string on the resulting page comes from
 * `getAyahRange`, which reads the vendored Tanzil ʿUthmānī corpus. This module
 * splits on whitespace and does nothing else to it — no repair, no completion,
 * no normalisation. If the corpus does not have the passage, the result is an
 * empty page and the caller says "not yet recorded".
 *
 * Ink depth is a PROJECTION of recorded evidence, never an invention: a unit
 * with no memory state is depth 0, which reads as "not yet earned" rather than
 * as a failure.
 */
export type MushafView = {
  readonly lines: readonly MushafLine[];
  readonly page: number | null;
  readonly sura: number;
  readonly ayahFrom: number;
  readonly ayahTo: number;
};

/** Words per packed line while the layout package records no line breaks. */
const WORDS_PER_LINE = 8;

function pack(words: readonly MushafWord[]): readonly MushafLine[] {
  const lines: MushafLine[] = [];
  for (let start = 0; start < words.length; start += WORDS_PER_LINE) {
    lines.push({ id: `line-${start}`, words: words.slice(start, start + WORDS_PER_LINE) });
  }
  return lines;
}

function unitIdFor(sura: number, ayah: number): UnitId {
  return `b:${sura}:${ayah}`;
}

/**
 * A passage, with each āyah inked to the depth the learner has actually earned.
 *
 * `learnerUserId` is optional: the verification console shows the page to a
 * teacher who is listening, and the depths are context, not the point.
 */
export async function mushafViewFor(
  organizationId: string,
  sura: number,
  ayahFrom: number,
  ayahTo: number,
  learnerUserId?: string,
): Promise<MushafView> {
  const ayahs = getAyahRange(sura, ayahFrom, ayahTo);
  if (ayahs.length === 0) {
    return { lines: [], page: null, sura, ayahFrom, ayahTo };
  }

  const depths = new Map<number, number>();
  if (learnerUserId !== undefined) {
    const states = await getStates(
      organizationId,
      learnerUserId,
      ayahs.map((verse) => unitIdFor(verse.sura, verse.ayah)),
    );
    for (const verse of ayahs) {
      const state = states.get(unitIdFor(verse.sura, verse.ayah));
      // Confidence 0..1 onto the five-rung ink ladder. Nothing is rounded up
      // into "earned" that the evidence does not support.
      depths.set(verse.ayah, state === undefined ? 0 : Math.round(state.confidence * 5));
    }
  }

  const words: MushafWord[] = [];
  for (const verse of ayahs) {
    const tokens = verse.text.split(/\s+/u).filter((token) => token.length > 0);
    const depth = toInkDepth(learnerUserId === undefined ? 5 : (depths.get(verse.ayah) ?? 0));
    tokens.forEach((token, position) => {
      words.push({
        text: token,
        depth,
        ayah: verse.ayah,
        index: position + 1,
        endsAyah: position === tokens.length - 1,
      });
    });
  }

  const page = pageOf(sura, ayahFrom);
  return {
    lines: pack(words),
    page,
    sura,
    ayahFrom,
    ayahTo: ayahs[ayahs.length - 1]?.ayah ?? ayahTo,
  };
}

/** The whole muṣḥaf page a reference sits on, when the teacher wants context. */
export function pageExists(page: number): boolean {
  return getPage(page) !== null;
}

/**
 * Read a verification request's scope. The scope is a JSON column written by
 * the learner's client, so it is parsed defensively: an unreadable scope means
 * an empty page, never a guessed passage.
 */
export type ParsedScope = {
  readonly sura: number;
  readonly ayahFrom: number;
  readonly ayahTo: number;
} | null;

export function parseUnitScope(scope: unknown): ParsedScope {
  if (scope === null || typeof scope !== "object" || Array.isArray(scope)) return null;
  const record = scope as Record<string, unknown>;
  const sura = record.sura;
  const from = record.ayahFrom;
  const to = record.ayahTo;
  if (typeof sura !== "number" || typeof from !== "number") return null;
  return {
    sura,
    ayahFrom: from,
    ayahTo: typeof to === "number" ? to : from,
  };
}
