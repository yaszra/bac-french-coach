/**
 * The Qāʿidah concept lattice.
 *
 * Reading (Qāʿidah) is taught as a lattice of small, nameable skills: a letter, that
 * letter's shape in a position, that letter carrying a short vowel, the articulation
 * family it belongs to, then sukūn, shaddah, tanwīn, madd and the tajwīd rules built
 * on top of them.
 *
 * ## Sacred-content rule
 *
 * This module contains Arabic **letters and diacritic marks** — single Unicode
 * codepoints — and nothing else. A letter is teaching data (an alphabet), not
 * scripture: no word, no phrase, no āyah, no connected Qurʾānic text appears here or
 * is ever produced by this engine. The Qāʿidah *references* scripture (a rule points
 * at a corpus location); it never retypes it. Everything the learner sees is either a
 * codepoint from the table below or an i18n key resolved by the UI.
 *
 * ## Makhārij — source of authority
 *
 * The articulation groups are the classical **seventeen makhārij in five regions**
 * (mawāḍiʿ) of Ibn al-Jazarī's *al-Muqaddimah al-Jazariyyah*, which is the scheme
 * taught with the Ḥafṣ ʿan ʿĀṣim reading this platform follows. The five regions are
 * al-jawf, al-ḥalq (3), al-lisān (10), ash-shafatān (2), al-khayshūm.
 *
 * Two consequences are worth stating because tests depend on them:
 *
 * 1. **Every letter has exactly one *primary* makhraj.** Wāw and yāʾ resonate in
 *    al-jawf when they are letters of madd, but their consonantal makhraj is the lips
 *    and the middle of the tongue respectively; those are their primary groups. Alif
 *    only ever occurs as madd, so al-jawf is its primary group and its only member.
 * 2. **Al-khayshūm has no primary letter.** It is the makhraj of the *ghunnah* — a
 *    quality of nūn and mīm in particular states, not a letter. Its
 *    `letterCodepoints` is deliberately empty rather than dishonestly populated.
 *
 * Hamzah is carried as a twenty-ninth letter concept. The alphabet is twenty-eight
 * (alif … yāʾ); hamzah has its own makhraj (aqṣā al-ḥalq) and its own teaching, so it
 * is a concept but is not counted in `ARABIC_ALPHABET`.
 *
 * ## Ids
 *
 * Concept ids are lowercase ASCII, dot-separated, and compatible with the memory
 * engine's `c:<key>` unit grammar (`conceptUnitId`). Letter id segments are the
 * **Unicode character names** for the Arabic block (`beh`, `theh`, `hah`, `heh`, …)
 * because they are ASCII, stable, and collision-free where transliterations are not
 * (ḥāʾ/hāʾ, tāʾ/ṭāʾ, dhāl/ẓāʾ/zāy all collide in naive ASCII). Display names come
 * from `labelKey`, never from an id.
 *
 * Pure module: no I/O, no clock, no randomness.
 */

import { conceptUnitId, reason, type Reason, type UnitId } from "@/modules/memory/domain/types";

/* --------------------------------------------------------------------- kinds */

export const CONCEPT_KINDS = [
  "letter",
  "letter_form",
  "letter_harakah",
  "makhraj_group",
  "sukun",
  "shaddah",
  "madd",
  "tanwin",
  "tajwid_rule",
] as const;

export type ConceptKind = (typeof CONCEPT_KINDS)[number];

/** Opaque concept identity, e.g. `letter.beh`, `letter.beh.fathah`, `madd.tabii`. */
export type ConceptId = string;

/** Concept ids are ASCII references. A literal Arabic string would fail this. */
export const CONCEPT_ID_RE = /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)*$/;

/** i18n keys look like `a.b.c`; a literal sentence would fail this. */
export const LABEL_KEY_RE = /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)+$/;

export function isConceptId(value: string): boolean {
  return value.length > 0 && value.length <= 120 && CONCEPT_ID_RE.test(value);
}

/** Bridge a reading concept into the memory engine's unit grammar (`c:<key>`). */
export function conceptIdToUnitId(id: ConceptId): UnitId {
  return conceptUnitId(id);
}

/* ------------------------------------------------------------------ makhārij */

export const MAKHRAJ_REGIONS = ["jawf", "halq", "lisan", "shafatan", "khayshum"] as const;
export type MakhrajRegion = (typeof MAKHRAJ_REGIONS)[number];

/**
 * The seventeen makhārij, in the classical order (deepest to most forward, nasal
 * last). Ids are `makhraj.<region>[.<place>]`.
 */
export const MAKHRAJ_IDS = [
  "makhraj.jawf",
  "makhraj.halq.aqsa",
  "makhraj.halq.wasat",
  "makhraj.halq.adna",
  "makhraj.lisan.aqsa_lahat",
  "makhraj.lisan.aqsa_hanak",
  "makhraj.lisan.wasat",
  "makhraj.lisan.haffah_adras",
  "makhraj.lisan.adna_haffah",
  "makhraj.lisan.taraf_noon",
  "makhraj.lisan.taraf_ra",
  "makhraj.lisan.nita",
  "makhraj.lisan.safir",
  "makhraj.lisan.lithah",
  "makhraj.shafatan.batn_shafah",
  "makhraj.shafatan.shafatayn",
  "makhraj.khayshum",
] as const;

/** The identifier of one of the seventeen makhārij. */
export type MakhrajGroup = (typeof MAKHRAJ_IDS)[number];

export interface MakhrajDefinition {
  readonly id: MakhrajGroup;
  readonly region: MakhrajRegion;
  /** Position within the region, deepest first — used for articulation proximity. */
  readonly depth: number;
  readonly labelKey: string;
}

export const MAKHARIJ: readonly MakhrajDefinition[] = [
  { id: "makhraj.jawf", region: "jawf", depth: 0, labelKey: "reading.makhraj.jawf" },
  { id: "makhraj.halq.aqsa", region: "halq", depth: 0, labelKey: "reading.makhraj.halq.aqsa" },
  { id: "makhraj.halq.wasat", region: "halq", depth: 1, labelKey: "reading.makhraj.halq.wasat" },
  { id: "makhraj.halq.adna", region: "halq", depth: 2, labelKey: "reading.makhraj.halq.adna" },
  {
    id: "makhraj.lisan.aqsa_lahat",
    region: "lisan",
    depth: 0,
    labelKey: "reading.makhraj.lisan.aqsa_lahat",
  },
  {
    id: "makhraj.lisan.aqsa_hanak",
    region: "lisan",
    depth: 1,
    labelKey: "reading.makhraj.lisan.aqsa_hanak",
  },
  { id: "makhraj.lisan.wasat", region: "lisan", depth: 2, labelKey: "reading.makhraj.lisan.wasat" },
  {
    id: "makhraj.lisan.haffah_adras",
    region: "lisan",
    depth: 3,
    labelKey: "reading.makhraj.lisan.haffah_adras",
  },
  {
    id: "makhraj.lisan.adna_haffah",
    region: "lisan",
    depth: 4,
    labelKey: "reading.makhraj.lisan.adna_haffah",
  },
  {
    id: "makhraj.lisan.taraf_noon",
    region: "lisan",
    depth: 5,
    labelKey: "reading.makhraj.lisan.taraf_noon",
  },
  {
    id: "makhraj.lisan.taraf_ra",
    region: "lisan",
    depth: 6,
    labelKey: "reading.makhraj.lisan.taraf_ra",
  },
  { id: "makhraj.lisan.nita", region: "lisan", depth: 7, labelKey: "reading.makhraj.lisan.nita" },
  { id: "makhraj.lisan.safir", region: "lisan", depth: 8, labelKey: "reading.makhraj.lisan.safir" },
  {
    id: "makhraj.lisan.lithah",
    region: "lisan",
    depth: 9,
    labelKey: "reading.makhraj.lisan.lithah",
  },
  {
    id: "makhraj.shafatan.batn_shafah",
    region: "shafatan",
    depth: 0,
    labelKey: "reading.makhraj.shafatan.batn_shafah",
  },
  {
    id: "makhraj.shafatan.shafatayn",
    region: "shafatan",
    depth: 1,
    labelKey: "reading.makhraj.shafatan.shafatayn",
  },
  { id: "makhraj.khayshum", region: "khayshum", depth: 0, labelKey: "reading.makhraj.khayshum" },
];

const MAKHRAJ_BY_ID: ReadonlyMap<MakhrajGroup, MakhrajDefinition> = new Map(
  MAKHARIJ.map((group) => [group.id, group]),
);

export function makhrajById(id: MakhrajGroup): MakhrajDefinition | null {
  return MAKHRAJ_BY_ID.get(id) ?? null;
}

/** Region order, used only for articulation-proximity scoring. */
const REGION_ORDER: Readonly<Record<MakhrajRegion, number>> = {
  jawf: 0,
  halq: 1,
  lisan: 2,
  shafatan: 3,
  khayshum: 4,
};

export function makhrajRegionDistance(a: MakhrajGroup, b: MakhrajGroup): number | null {
  const left = MAKHRAJ_BY_ID.get(a);
  const right = MAKHRAJ_BY_ID.get(b);
  if (left === undefined || right === undefined) return null;
  return Math.abs(REGION_ORDER[left.region] - REGION_ORDER[right.region]);
}

/* ------------------------------------------------------------------- letters */

/** Rasm families — letters that share a written skeleton and differ only by dots. */
export const SKELETONS = [
  "alef",
  "beh",
  "hah",
  "dal",
  "reh",
  "seen",
  "sad",
  "tah",
  "ain",
  "feh",
  "kaf",
  "lam",
  "meem",
  "heh",
  "waw",
  "hamza",
] as const;

export type Skeleton = (typeof SKELETONS)[number];

export type DotPosition = "above" | "below" | "none";

export interface LetterDots {
  readonly count: 0 | 1 | 2 | 3;
  readonly position: DotPosition;
}

export interface ArabicLetter {
  /** `letter.<unicode-name>` — the concept id. */
  readonly id: ConceptId;
  /** Unicode character-name segment; ASCII, collision-free, never displayed raw. */
  readonly name: string;
  /** The single Arabic codepoint. Teaching data — an alphabet, never scripture. */
  readonly codepoint: string;
  /** `U+xxxx`, so a reviewer can check the codepoint without rendering Arabic. */
  readonly unicode: string;
  readonly makhraj: MakhrajGroup;
  readonly skeleton: Skeleton;
  readonly dots: LetterDots;
  /** Whether the letter joins to what follows it (six letters, plus hamzah, do not). */
  readonly connectsForward: boolean;
  /** Whether the letter joins to what precedes it (hamzah alone does not). */
  readonly connectsBackward: boolean;
  /** True for the twenty-eight alphabet letters; false for hamzah. */
  readonly inAlphabet: boolean;
  /** Hijāʾī order, 1-based; hamzah is 0 (outside the alphabet ordering). */
  readonly order: number;
}

const NO_DOTS: LetterDots = { count: 0, position: "none" };

/**
 * The alphabet plus hamzah. Codepoints are the bare Arabic letters — U+0621 …
 * U+064A — carrying no vowel marks and forming no word.
 */
export const ARABIC_LETTERS: readonly ArabicLetter[] = [
  {
    id: "letter.alef",
    name: "alef",
    codepoint: "ا",
    unicode: "U+0627",
    makhraj: "makhraj.jawf",
    skeleton: "alef",
    dots: NO_DOTS,
    connectsForward: false,
    connectsBackward: true,
    inAlphabet: true,
    order: 1,
  },
  {
    id: "letter.beh",
    name: "beh",
    codepoint: "ب",
    unicode: "U+0628",
    makhraj: "makhraj.shafatan.shafatayn",
    skeleton: "beh",
    dots: { count: 1, position: "below" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 2,
  },
  {
    id: "letter.teh",
    name: "teh",
    codepoint: "ت",
    unicode: "U+062A",
    makhraj: "makhraj.lisan.nita",
    skeleton: "beh",
    dots: { count: 2, position: "above" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 3,
  },
  {
    id: "letter.theh",
    name: "theh",
    codepoint: "ث",
    unicode: "U+062B",
    makhraj: "makhraj.lisan.lithah",
    skeleton: "beh",
    dots: { count: 3, position: "above" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 4,
  },
  {
    id: "letter.jeem",
    name: "jeem",
    codepoint: "ج",
    unicode: "U+062C",
    makhraj: "makhraj.lisan.wasat",
    skeleton: "hah",
    dots: { count: 1, position: "below" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 5,
  },
  {
    id: "letter.hah",
    name: "hah",
    codepoint: "ح",
    unicode: "U+062D",
    makhraj: "makhraj.halq.wasat",
    skeleton: "hah",
    dots: NO_DOTS,
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 6,
  },
  {
    id: "letter.khah",
    name: "khah",
    codepoint: "خ",
    unicode: "U+062E",
    makhraj: "makhraj.halq.adna",
    skeleton: "hah",
    dots: { count: 1, position: "above" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 7,
  },
  {
    id: "letter.dal",
    name: "dal",
    codepoint: "د",
    unicode: "U+062F",
    makhraj: "makhraj.lisan.nita",
    skeleton: "dal",
    dots: NO_DOTS,
    connectsForward: false,
    connectsBackward: true,
    inAlphabet: true,
    order: 8,
  },
  {
    id: "letter.thal",
    name: "thal",
    codepoint: "ذ",
    unicode: "U+0630",
    makhraj: "makhraj.lisan.lithah",
    skeleton: "dal",
    dots: { count: 1, position: "above" },
    connectsForward: false,
    connectsBackward: true,
    inAlphabet: true,
    order: 9,
  },
  {
    id: "letter.reh",
    name: "reh",
    codepoint: "ر",
    unicode: "U+0631",
    makhraj: "makhraj.lisan.taraf_ra",
    skeleton: "reh",
    dots: NO_DOTS,
    connectsForward: false,
    connectsBackward: true,
    inAlphabet: true,
    order: 10,
  },
  {
    id: "letter.zain",
    name: "zain",
    codepoint: "ز",
    unicode: "U+0632",
    makhraj: "makhraj.lisan.safir",
    skeleton: "reh",
    dots: { count: 1, position: "above" },
    connectsForward: false,
    connectsBackward: true,
    inAlphabet: true,
    order: 11,
  },
  {
    id: "letter.seen",
    name: "seen",
    codepoint: "س",
    unicode: "U+0633",
    makhraj: "makhraj.lisan.safir",
    skeleton: "seen",
    dots: NO_DOTS,
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 12,
  },
  {
    id: "letter.sheen",
    name: "sheen",
    codepoint: "ش",
    unicode: "U+0634",
    makhraj: "makhraj.lisan.wasat",
    skeleton: "seen",
    dots: { count: 3, position: "above" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 13,
  },
  {
    id: "letter.sad",
    name: "sad",
    codepoint: "ص",
    unicode: "U+0635",
    makhraj: "makhraj.lisan.safir",
    skeleton: "sad",
    dots: NO_DOTS,
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 14,
  },
  {
    id: "letter.dad",
    name: "dad",
    codepoint: "ض",
    unicode: "U+0636",
    makhraj: "makhraj.lisan.haffah_adras",
    skeleton: "sad",
    dots: { count: 1, position: "above" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 15,
  },
  {
    id: "letter.tah",
    name: "tah",
    codepoint: "ط",
    unicode: "U+0637",
    makhraj: "makhraj.lisan.nita",
    skeleton: "tah",
    dots: NO_DOTS,
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 16,
  },
  {
    id: "letter.zah",
    name: "zah",
    codepoint: "ظ",
    unicode: "U+0638",
    makhraj: "makhraj.lisan.lithah",
    skeleton: "tah",
    dots: { count: 1, position: "above" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 17,
  },
  {
    id: "letter.ain",
    name: "ain",
    codepoint: "ع",
    unicode: "U+0639",
    makhraj: "makhraj.halq.wasat",
    skeleton: "ain",
    dots: NO_DOTS,
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 18,
  },
  {
    id: "letter.ghain",
    name: "ghain",
    codepoint: "غ",
    unicode: "U+063A",
    makhraj: "makhraj.halq.adna",
    skeleton: "ain",
    dots: { count: 1, position: "above" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 19,
  },
  {
    id: "letter.feh",
    name: "feh",
    codepoint: "ف",
    unicode: "U+0641",
    makhraj: "makhraj.shafatan.batn_shafah",
    skeleton: "feh",
    dots: { count: 1, position: "above" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 20,
  },
  {
    id: "letter.qaf",
    name: "qaf",
    codepoint: "ق",
    unicode: "U+0642",
    makhraj: "makhraj.lisan.aqsa_lahat",
    skeleton: "feh",
    dots: { count: 2, position: "above" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 21,
  },
  {
    id: "letter.kaf",
    name: "kaf",
    codepoint: "ك",
    unicode: "U+0643",
    makhraj: "makhraj.lisan.aqsa_hanak",
    skeleton: "kaf",
    dots: NO_DOTS,
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 22,
  },
  {
    id: "letter.lam",
    name: "lam",
    codepoint: "ل",
    unicode: "U+0644",
    makhraj: "makhraj.lisan.adna_haffah",
    skeleton: "lam",
    dots: NO_DOTS,
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 23,
  },
  {
    id: "letter.meem",
    name: "meem",
    codepoint: "م",
    unicode: "U+0645",
    makhraj: "makhraj.shafatan.shafatayn",
    skeleton: "meem",
    dots: NO_DOTS,
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 24,
  },
  {
    id: "letter.noon",
    name: "noon",
    codepoint: "ن",
    unicode: "U+0646",
    makhraj: "makhraj.lisan.taraf_noon",
    skeleton: "beh",
    dots: { count: 1, position: "above" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 25,
  },
  {
    id: "letter.heh",
    name: "heh",
    codepoint: "ه",
    unicode: "U+0647",
    makhraj: "makhraj.halq.aqsa",
    skeleton: "heh",
    dots: NO_DOTS,
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 26,
  },
  {
    id: "letter.waw",
    name: "waw",
    codepoint: "و",
    unicode: "U+0648",
    makhraj: "makhraj.shafatan.shafatayn",
    skeleton: "waw",
    dots: NO_DOTS,
    connectsForward: false,
    connectsBackward: true,
    inAlphabet: true,
    order: 27,
  },
  {
    id: "letter.yeh",
    name: "yeh",
    codepoint: "ي",
    unicode: "U+064A",
    makhraj: "makhraj.lisan.wasat",
    skeleton: "beh",
    dots: { count: 2, position: "below" },
    connectsForward: true,
    connectsBackward: true,
    inAlphabet: true,
    order: 28,
  },
  {
    id: "letter.hamza",
    name: "hamza",
    codepoint: "ء",
    unicode: "U+0621",
    makhraj: "makhraj.halq.aqsa",
    skeleton: "hamza",
    dots: NO_DOTS,
    connectsForward: false,
    connectsBackward: false,
    inAlphabet: false,
    order: 0,
  },
];

/** The twenty-eight alphabet letters, in hijāʾī order. Hamzah is not among them. */
export const ARABIC_ALPHABET: readonly ArabicLetter[] = ARABIC_LETTERS.filter(
  (letter) => letter.inAlphabet,
).sort((a, b) => a.order - b.order);

const LETTER_BY_ID: ReadonlyMap<ConceptId, ArabicLetter> = new Map(
  ARABIC_LETTERS.map((letter) => [letter.id, letter]),
);

export function letterById(id: ConceptId): ArabicLetter | null {
  return LETTER_BY_ID.get(id) ?? null;
}

export function makhrajOfLetter(id: ConceptId): MakhrajGroup | null {
  return LETTER_BY_ID.get(id)?.makhraj ?? null;
}

/** The letters whose *primary* makhraj is `group`, in hijāʾī order (hamzah first). */
export function lettersOfMakhraj(group: MakhrajGroup): readonly ArabicLetter[] {
  return ARABIC_LETTERS.filter((letter) => letter.makhraj === group).sort(
    (a, b) => a.order - b.order,
  );
}

/* --------------------------------------------------------------- diacritics */

/** The three short vowels, in the order the Qāʿidah teaches them. */
export const HARAKAT = [
  { id: "harakah.fathah", name: "fathah", codepoint: "َ", unicode: "U+064E" },
  { id: "harakah.dammah", name: "dammah", codepoint: "ُ", unicode: "U+064F" },
  { id: "harakah.kasrah", name: "kasrah", codepoint: "ِ", unicode: "U+0650" },
] as const;

export type HarakahId = (typeof HARAKAT)[number]["id"];

export const SUKUN_CODEPOINT = "ْ";
export const SHADDAH_CODEPOINT = "ّ";

/** The tanwīn marks, paired with the short vowel each doubles. */
export const TANWIN = [
  { id: "tanwin.fath", codepoint: "ً", unicode: "U+064B", harakah: "harakah.fathah" },
  { id: "tanwin.damm", codepoint: "ٌ", unicode: "U+064C", harakah: "harakah.dammah" },
  { id: "tanwin.kasr", codepoint: "ٍ", unicode: "U+064D", harakah: "harakah.kasrah" },
] as const;

/** The four letter positions. */
export const LETTER_FORMS = ["isolated", "initial", "medial", "final"] as const;
export type LetterForm = (typeof LETTER_FORMS)[number];

/**
 * The positions a letter actually takes.
 *
 * Six letters (alif, dāl, dhāl, rāʾ, zāy, wāw) never join to what follows, so they
 * have no distinct initial or medial shape; hamzah joins on neither side. Emitting
 * four form concepts for them would invent skills a learner can neither practise nor
 * fail, so `formsOfLetter` returns only the positions that exist (honesty rule).
 */
export function formsOfLetter(letter: ArabicLetter): readonly LetterForm[] {
  if (!letter.connectsForward && !letter.connectsBackward) return ["isolated"];
  if (!letter.connectsForward) return ["isolated", "final"];
  return LETTER_FORMS;
}

/* ------------------------------------------------------------------ concepts */

export interface ReadingConcept {
  readonly id: ConceptId;
  readonly kind: ConceptKind;
  /** i18n key — never literal user-visible text. */
  readonly labelKey: string;
  /** Bare Arabic codepoints this concept teaches. Never a word or a phrase. */
  readonly letterCodepoints?: readonly string[];
  readonly makhraj?: MakhrajGroup;
  readonly prerequisites: readonly ConceptId[];
}

export interface PrerequisiteEdge {
  readonly from: ConceptId;
  readonly to: ConceptId;
}

export interface ReadingLattice {
  readonly concepts: readonly ReadingConcept[];
  /** Derived: one edge per (prerequisite → dependent) pair, sorted and deduplicated. */
  readonly edges: readonly PrerequisiteEdge[];
}

function letterConcepts(): readonly ReadingConcept[] {
  return ARABIC_LETTERS.map((letter) => ({
    id: letter.id,
    kind: "letter" as const,
    labelKey: `reading.concept.${letter.id}`,
    letterCodepoints: [letter.codepoint],
    makhraj: letter.makhraj,
    prerequisites: [],
  }));
}

function makhrajConcepts(): readonly ReadingConcept[] {
  return MAKHARIJ.map((group) => {
    const letters = lettersOfMakhraj(group.id);
    // Al-khayshūm has no letter of its own: it is the makhraj of the ghunnah, a
    // quality of nūn and mīm. Its prerequisites name those two letters; its
    // `letterCodepoints` stays empty rather than claim members it does not have.
    const prerequisites =
      group.id === "makhraj.khayshum"
        ? ["letter.noon", "letter.meem"]
        : letters.map((letter) => letter.id);
    return {
      id: group.id,
      kind: "makhraj_group" as const,
      labelKey: group.labelKey,
      letterCodepoints: letters.map((letter) => letter.codepoint),
      makhraj: group.id,
      prerequisites,
    };
  });
}

export function formConceptId(letterId: ConceptId, form: LetterForm): ConceptId {
  return `form.${letterId.slice("letter.".length)}.${form}`;
}

function formConcepts(): readonly ReadingConcept[] {
  const concepts: ReadingConcept[] = [];
  for (const letter of ARABIC_LETTERS) {
    const forms = formsOfLetter(letter);
    let previous: ConceptId = letter.id;
    for (const form of forms) {
      const id = formConceptId(letter.id, form);
      concepts.push({
        id,
        kind: "letter_form",
        labelKey: `reading.concept.form.${form}`,
        letterCodepoints: [letter.codepoint],
        makhraj: letter.makhraj,
        prerequisites: [previous],
      });
      previous = id;
    }
  }
  return concepts;
}

function harakahConcepts(): readonly ReadingConcept[] {
  const concepts: ReadingConcept[] = [];
  let previous: ConceptId | null = null;
  for (const harakah of HARAKAT) {
    concepts.push({
      id: harakah.id,
      kind: "letter_harakah",
      labelKey: `reading.concept.${harakah.id}`,
      letterCodepoints: [harakah.codepoint],
      prerequisites: previous === null ? [] : [previous],
    });
    previous = harakah.id;
  }
  return concepts;
}

export function letterHarakahConceptId(letterId: ConceptId, harakah: HarakahId): ConceptId {
  return `${letterId}.${harakah.slice("harakah.".length)}`;
}

function letterHarakahConcepts(): readonly ReadingConcept[] {
  const concepts: ReadingConcept[] = [];
  for (const letter of ARABIC_LETTERS) {
    for (const harakah of HARAKAT) {
      concepts.push({
        id: letterHarakahConceptId(letter.id, harakah.id),
        kind: "letter_harakah",
        labelKey: `reading.concept.harakah_on_letter.${harakah.name}`,
        letterCodepoints: [letter.codepoint, harakah.codepoint],
        makhraj: letter.makhraj,
        prerequisites: [letter.id, harakah.id],
      });
    }
  }
  return concepts;
}

const ALL_HARAKAT: readonly ConceptId[] = HARAKAT.map((harakah) => harakah.id);

function markConcepts(): readonly ReadingConcept[] {
  return [
    {
      id: "sukun",
      kind: "sukun",
      labelKey: "reading.concept.sukun",
      letterCodepoints: [SUKUN_CODEPOINT],
      prerequisites: ALL_HARAKAT,
    },
    {
      id: "shaddah",
      kind: "shaddah",
      labelKey: "reading.concept.shaddah",
      letterCodepoints: [SHADDAH_CODEPOINT],
      prerequisites: ["sukun"],
    },
    {
      id: "tanwin",
      kind: "tanwin",
      labelKey: "reading.concept.tanwin",
      letterCodepoints: TANWIN.map((mark) => mark.codepoint),
      prerequisites: ALL_HARAKAT,
    },
    ...TANWIN.map(
      (mark): ReadingConcept => ({
        id: mark.id,
        kind: "tanwin",
        labelKey: `reading.concept.${mark.id}`,
        letterCodepoints: [mark.codepoint],
        prerequisites: ["tanwin", mark.harakah],
      }),
    ),
  ];
}

const MADD_LETTERS: readonly ConceptId[] = ["letter.alef", "letter.waw", "letter.yeh"];

function maddConcepts(): readonly ReadingConcept[] {
  return [
    {
      id: "madd.tabii",
      kind: "madd",
      labelKey: "reading.concept.madd.tabii",
      letterCodepoints: MADD_LETTERS.map((id) => letterById(id)?.codepoint ?? ""),
      prerequisites: ["sukun", ...MADD_LETTERS],
    },
    {
      id: "madd.iwad",
      kind: "madd",
      labelKey: "reading.concept.madd.iwad",
      letterCodepoints: ["ً", "ا"],
      prerequisites: ["madd.tabii", "tanwin.fath"],
    },
    {
      id: "madd.badal",
      kind: "madd",
      labelKey: "reading.concept.madd.badal",
      letterCodepoints: ["ء", "ا"],
      prerequisites: ["madd.tabii", "letter.hamza"],
    },
    {
      id: "madd.silah",
      kind: "madd",
      labelKey: "reading.concept.madd.silah",
      letterCodepoints: ["ه"],
      prerequisites: ["madd.tabii", "letter.heh"],
    },
  ];
}

const THROAT_MAKHARIJ: readonly ConceptId[] = [
  "makhraj.halq.aqsa",
  "makhraj.halq.wasat",
  "makhraj.halq.adna",
];

function tajwidConcepts(): readonly ReadingConcept[] {
  return [
    {
      id: "rule.ghunnah",
      kind: "tajwid_rule",
      labelKey: "reading.concept.rule.ghunnah",
      makhraj: "makhraj.khayshum",
      prerequisites: ["makhraj.khayshum", "shaddah", "letter.noon", "letter.meem"],
    },
    {
      id: "rule.noon_sakinah.izhar",
      kind: "tajwid_rule",
      labelKey: "reading.concept.rule.noon_sakinah.izhar",
      prerequisites: ["sukun", "tanwin", "letter.noon", ...THROAT_MAKHARIJ],
    },
    {
      id: "rule.noon_sakinah.idgham_bighunnah",
      kind: "tajwid_rule",
      labelKey: "reading.concept.rule.noon_sakinah.idgham_bighunnah",
      prerequisites: ["rule.ghunnah", "sukun", "tanwin", "letter.noon"],
    },
    {
      id: "rule.noon_sakinah.idgham_bila_ghunnah",
      kind: "tajwid_rule",
      labelKey: "reading.concept.rule.noon_sakinah.idgham_bila_ghunnah",
      prerequisites: ["sukun", "tanwin", "letter.noon", "letter.lam", "letter.reh"],
    },
    {
      id: "rule.noon_sakinah.iqlab",
      kind: "tajwid_rule",
      labelKey: "reading.concept.rule.noon_sakinah.iqlab",
      prerequisites: ["rule.ghunnah", "sukun", "tanwin", "letter.noon", "letter.beh"],
    },
    {
      id: "rule.noon_sakinah.ikhfa",
      kind: "tajwid_rule",
      labelKey: "reading.concept.rule.noon_sakinah.ikhfa",
      prerequisites: ["rule.ghunnah", "sukun", "tanwin", "letter.noon"],
    },
    {
      id: "rule.meem_sakinah.izhar_shafawi",
      kind: "tajwid_rule",
      labelKey: "reading.concept.rule.meem_sakinah.izhar_shafawi",
      prerequisites: ["sukun", "letter.meem"],
    },
    {
      id: "rule.meem_sakinah.ikhfa_shafawi",
      kind: "tajwid_rule",
      labelKey: "reading.concept.rule.meem_sakinah.ikhfa_shafawi",
      prerequisites: ["rule.ghunnah", "sukun", "letter.meem", "letter.beh"],
    },
    {
      id: "rule.meem_sakinah.idgham_mithlayn",
      kind: "tajwid_rule",
      labelKey: "reading.concept.rule.meem_sakinah.idgham_mithlayn",
      prerequisites: ["rule.ghunnah", "sukun", "letter.meem"],
    },
    {
      id: "rule.qalqalah",
      kind: "tajwid_rule",
      labelKey: "reading.concept.rule.qalqalah",
      letterCodepoints: ["ق", "ط", "ب", "ج", "د"],
      prerequisites: [
        "sukun",
        "letter.qaf",
        "letter.tah",
        "letter.beh",
        "letter.jeem",
        "letter.dal",
      ],
    },
    {
      id: "rule.reh.tafkhim_tarqiq",
      kind: "tajwid_rule",
      labelKey: "reading.concept.rule.reh.tafkhim_tarqiq",
      letterCodepoints: ["ر"],
      makhraj: "makhraj.lisan.taraf_ra",
      prerequisites: ["letter.reh", ...ALL_HARAKAT, "sukun"],
    },
    {
      id: "rule.lam.jalalah",
      kind: "tajwid_rule",
      labelKey: "reading.concept.rule.lam.jalalah",
      letterCodepoints: ["ل"],
      makhraj: "makhraj.lisan.adna_haffah",
      prerequisites: ["letter.lam", ...ALL_HARAKAT],
    },
  ];
}

function buildConcepts(): readonly ReadingConcept[] {
  return [
    ...letterConcepts(),
    ...formConcepts(),
    ...makhrajConcepts(),
    ...harakahConcepts(),
    ...letterHarakahConcepts(),
    ...markConcepts(),
    ...maddConcepts(),
    ...tajwidConcepts(),
  ];
}

function deriveEdges(concepts: readonly ReadingConcept[]): readonly PrerequisiteEdge[] {
  const seen = new Set<string>();
  const edges: PrerequisiteEdge[] = [];
  for (const concept of concepts) {
    for (const prerequisite of concept.prerequisites) {
      const key = `${prerequisite} ${concept.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: prerequisite, to: concept.id });
    }
  }
  return edges.sort((a, b) => (a.from === b.from ? compare(a.to, b.to) : compare(a.from, b.from)));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const CONCEPTS = buildConcepts();

/** The whole Qāʿidah lattice: concepts plus derived prerequisite edges. */
export const READING_LATTICE: ReadingLattice = {
  concepts: CONCEPTS,
  edges: deriveEdges(CONCEPTS),
};

const CONCEPT_BY_ID: ReadonlyMap<ConceptId, ReadingConcept> = new Map(
  CONCEPTS.map((concept) => [concept.id, concept]),
);

export function conceptById(id: ConceptId): ReadingConcept | null {
  return CONCEPT_BY_ID.get(id) ?? null;
}

export function conceptsOfKind(
  kind: ConceptKind,
  lattice: ReadingLattice = READING_LATTICE,
): readonly ReadingConcept[] {
  return lattice.concepts.filter((concept) => concept.kind === kind);
}

/* ---------------------------------------------------------------- validation */

export type LatticeErrorCode =
  | "duplicate_concept"
  | "invalid_concept_id"
  | "invalid_label_key"
  | "unknown_prerequisite"
  | "self_prerequisite"
  | "prerequisite_cycle"
  | "unreachable_concept"
  | "unknown_makhraj"
  | "duplicate_codepoint"
  | "letter_without_makhraj"
  | "letter_in_multiple_makhraj_groups"
  | "alphabet_size";

export interface LatticeError {
  readonly code: LatticeErrorCode;
  readonly reason: Reason;
}

/**
 * Validate the lattice. **Returns** errors, never throws: a malformed curriculum is a
 * report for the studio editor, not a crash inside a child's lesson.
 *
 * Checks: unique ids, id and label-key grammar, every prerequisite exists, no
 * self-edges, the prerequisite graph is acyclic, every concept is reachable by
 * unlocking from the roots, the 28-letter alphabet is complete with distinct
 * codepoints, and every letter sits in exactly one primary makhraj group.
 */
export function validateLattice(lattice: ReadingLattice = READING_LATTICE): readonly LatticeError[] {
  const errors: LatticeError[] = [];
  const ids = new Set<ConceptId>();

  for (const concept of lattice.concepts) {
    if (ids.has(concept.id)) {
      errors.push({
        code: "duplicate_concept",
        reason: reason("reading.lattice.error.duplicate_concept", { conceptId: concept.id }),
      });
    }
    ids.add(concept.id);
    if (!isConceptId(concept.id)) {
      errors.push({
        code: "invalid_concept_id",
        reason: reason("reading.lattice.error.invalid_concept_id", { conceptId: concept.id }),
      });
    }
    if (!LABEL_KEY_RE.test(concept.labelKey)) {
      errors.push({
        code: "invalid_label_key",
        reason: reason("reading.lattice.error.invalid_label_key", {
          conceptId: concept.id,
          labelKey: concept.labelKey,
        }),
      });
    }
    if (concept.makhraj !== undefined && !MAKHRAJ_BY_ID.has(concept.makhraj)) {
      errors.push({
        code: "unknown_makhraj",
        reason: reason("reading.lattice.error.unknown_makhraj", {
          conceptId: concept.id,
          makhraj: concept.makhraj,
        }),
      });
    }
  }

  for (const concept of lattice.concepts) {
    for (const prerequisite of concept.prerequisites) {
      if (prerequisite === concept.id) {
        errors.push({
          code: "self_prerequisite",
          reason: reason("reading.lattice.error.self_prerequisite", { conceptId: concept.id }),
        });
        continue;
      }
      if (!ids.has(prerequisite)) {
        errors.push({
          code: "unknown_prerequisite",
          reason: reason("reading.lattice.error.unknown_prerequisite", {
            conceptId: concept.id,
            prerequisite,
          }),
        });
      }
    }
  }

  // Reachability by unlocking: start from concepts with no prerequisites, then
  // repeatedly unlock a concept once every one of its prerequisites is unlocked.
  // Anything still locked at the fixed point is either in a cycle or blocked by an
  // unknown prerequisite — both worth reporting by name.
  const unlocked = new Set<ConceptId>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const concept of lattice.concepts) {
      if (unlocked.has(concept.id)) continue;
      const ready = concept.prerequisites.every(
        (prerequisite) => prerequisite !== concept.id && unlocked.has(prerequisite),
      );
      if (ready) {
        unlocked.add(concept.id);
        progressed = true;
      }
    }
  }
  for (const concept of lattice.concepts) {
    if (unlocked.has(concept.id)) continue;
    const blocked = concept.prerequisites.filter((prerequisite) => !unlocked.has(prerequisite));
    errors.push({
      code: blocked.some((prerequisite) => ids.has(prerequisite))
        ? "prerequisite_cycle"
        : "unreachable_concept",
      reason: reason("reading.lattice.error.unreachable_concept", {
        conceptId: concept.id,
        blockedBy: blocked.join(","),
      }),
    });
  }

  // Alphabet integrity.
  const alphabet = ARABIC_LETTERS.filter((letter) => letter.inAlphabet);
  if (alphabet.length !== 28) {
    errors.push({
      code: "alphabet_size",
      reason: reason("reading.lattice.error.alphabet_size", { count: alphabet.length }),
    });
  }
  const codepoints = new Set<string>();
  for (const letter of ARABIC_LETTERS) {
    if (codepoints.has(letter.codepoint)) {
      errors.push({
        code: "duplicate_codepoint",
        reason: reason("reading.lattice.error.duplicate_codepoint", { conceptId: letter.id }),
      });
    }
    codepoints.add(letter.codepoint);
    if (!MAKHRAJ_BY_ID.has(letter.makhraj)) {
      errors.push({
        code: "letter_without_makhraj",
        reason: reason("reading.lattice.error.letter_without_makhraj", { conceptId: letter.id }),
      });
    }
  }

  // Every letter appears in exactly one makhraj group's membership list.
  const membership = new Map<ConceptId, number>();
  for (const group of MAKHARIJ) {
    for (const letter of lettersOfMakhraj(group.id)) {
      membership.set(letter.id, (membership.get(letter.id) ?? 0) + 1);
    }
  }
  for (const letter of ARABIC_LETTERS) {
    const count = membership.get(letter.id) ?? 0;
    if (count !== 1) {
      errors.push({
        code: "letter_in_multiple_makhraj_groups",
        reason: reason("reading.lattice.error.letter_in_multiple_makhraj_groups", {
          conceptId: letter.id,
          groups: count,
        }),
      });
    }
  }

  return errors;
}

/* ------------------------------------------------------------------ ordering */

/**
 * All prerequisites of `id`, transitively. Sorted, deterministic. Returns an empty
 * list for an unknown id rather than throwing.
 */
export function prerequisiteClosure(
  id: ConceptId,
  lattice: ReadingLattice = READING_LATTICE,
): readonly ConceptId[] {
  const byId = lattice === READING_LATTICE ? CONCEPT_BY_ID : indexOf(lattice);
  const out = new Set<ConceptId>();
  const stack: ConceptId[] = [...(byId.get(id)?.prerequisites ?? [])];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined || out.has(next)) continue;
    out.add(next);
    for (const prerequisite of byId.get(next)?.prerequisites ?? []) stack.push(prerequisite);
  }
  return [...out].sort(compare);
}

/**
 * A deterministic topological order (Kahn, ties broken by id). Returns `null` when
 * the lattice has a cycle — the caller should have run `validateLattice` first.
 */
export function topologicalOrder(
  lattice: ReadingLattice = READING_LATTICE,
): readonly ConceptId[] | null {
  const byId = lattice === READING_LATTICE ? CONCEPT_BY_ID : indexOf(lattice);
  const remaining = new Map<ConceptId, number>();
  const dependents = new Map<ConceptId, ConceptId[]>();
  for (const concept of lattice.concepts) {
    const known = concept.prerequisites.filter((p) => byId.has(p) && p !== concept.id);
    remaining.set(concept.id, new Set(known).size);
    for (const prerequisite of new Set(known)) {
      const list = dependents.get(prerequisite);
      if (list === undefined) dependents.set(prerequisite, [concept.id]);
      else list.push(concept.id);
    }
  }
  const ready = [...remaining.entries()]
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort(compare);
  const order: ConceptId[] = [];
  while (ready.length > 0) {
    const next = ready.shift();
    if (next === undefined) break;
    order.push(next);
    for (const dependent of dependents.get(next) ?? []) {
      const count = (remaining.get(dependent) ?? 0) - 1;
      remaining.set(dependent, count);
      if (count === 0) {
        ready.push(dependent);
        ready.sort(compare);
      }
    }
  }
  return order.length === lattice.concepts.length ? order : null;
}

/** True when every prerequisite of `id` is in `mastered`. Unknown ids are locked. */
export function isUnlocked(
  id: ConceptId,
  mastered: ReadonlySet<ConceptId>,
  lattice: ReadingLattice = READING_LATTICE,
): boolean {
  const byId = lattice === READING_LATTICE ? CONCEPT_BY_ID : indexOf(lattice);
  const concept = byId.get(id);
  if (concept === undefined) return false;
  return concept.prerequisites.every((prerequisite) => mastered.has(prerequisite));
}

function indexOf(lattice: ReadingLattice): ReadonlyMap<ConceptId, ReadingConcept> {
  return new Map(lattice.concepts.map((concept) => [concept.id, concept]));
}
