/**
 * What an assignment is allowed to contain.
 *
 * An assignment travels from a teacher's screen, through a JSON column, into a
 * learner's device. That is exactly the path along which Qurʾānic text must
 * never travel: the payload carries REFERENCES — sūrah and āyah numbers, page
 * numbers, lesson ids — and the learner's device resolves them against the
 * vendored corpus. `containsArabicScript` below is the boundary guard, and a
 * build gate scans the repository for the same mistake.
 *
 * Pure. No corpus, no database, no clock beyond what the caller passes.
 */

export const ASSIGNMENT_TRACKS = ["hifz", "reading", "review"] as const;
export type AssignmentTrack = (typeof ASSIGNMENT_TRACKS)[number];

export type AyahRangeScope = {
  readonly kind: "ayah_range";
  readonly sura: number;
  readonly ayahFrom: number;
  readonly ayahTo: number;
};

export type PageScope = {
  readonly kind: "pages";
  readonly pageFrom: number;
  readonly pageTo: number;
};

export type LessonScope = {
  readonly kind: "lesson";
  /** A Qāʿidah lesson id from the content package. An id, never its content. */
  readonly lessonId: string;
};

export type ScopeItem = AyahRangeScope | PageScope | LessonScope;

/** Muṣḥaf pages in the Madanī 15-line layout. */
export const MAX_PAGE = 604;
export const MAX_SURA = 114;
/** The longest sūrah (al-Baqarah). No range may exceed it. */
export const MAX_AYAH = 286;

/**
 * Any character in the Arabic blocks.
 *
 * This is intentionally broad: an assignment has no legitimate reason to carry
 * a single Arabic character, so "some Arabic" and "scripture" need not be
 * distinguished here. Refusing the whole class is safer than judging it, and
 * a teacher's Arabic note belongs on a note field, not inside a scope payload.
 */
const ARABIC =
  /[\u0600-\u06FF\u0750-\u077F\u0870-\u089F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;

export function containsArabicScript(value: unknown): boolean {
  if (typeof value === "string") return ARABIC.test(value);
  if (Array.isArray(value)) return value.some(containsArabicScript);
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, entry]) => ARABIC.test(key) || containsArabicScript(entry),
    );
  }
  return false;
}

/* --------------------------------------------------------------- validation */

export const SCOPE_PROBLEMS = [
  "no_scope",
  "empty_range",
  "range_out_of_bounds",
  "unknown_lesson",
  "arabic_text_in_payload",
  "no_learners",
  "too_many_units",
] as const;
export type ScopeProblem = (typeof SCOPE_PROBLEMS)[number];

export type ScopeCheck =
  | { readonly ok: true; readonly units: number }
  | { readonly ok: false; readonly problems: readonly ScopeProblem[] };

function isInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value);
}

/** How many units a scope item covers — the number the review step states. */
export function unitsIn(item: ScopeItem): number {
  switch (item.kind) {
    case "ayah_range":
      return Math.max(0, item.ayahTo - item.ayahFrom + 1);
    case "pages":
      return Math.max(0, item.pageTo - item.pageFrom + 1);
    case "lesson":
      return 1;
  }
}

/** Nobody should be handed a thousand āyāt by a mis-typed range. */
export const MAX_UNITS_PER_ASSIGNMENT = 300;

export function checkScope(
  items: readonly ScopeItem[],
  learnerUserIds: readonly string[],
): ScopeCheck {
  const problems = new Set<ScopeProblem>();

  if (items.length === 0) problems.add("no_scope");
  if (learnerUserIds.length === 0) problems.add("no_learners");
  if (containsArabicScript(items)) problems.add("arabic_text_in_payload");

  for (const item of items) {
    switch (item.kind) {
      case "ayah_range": {
        if (!isInteger(item.sura) || !isInteger(item.ayahFrom) || !isInteger(item.ayahTo)) {
          problems.add("range_out_of_bounds");
          break;
        }
        if (item.sura < 1 || item.sura > MAX_SURA) problems.add("range_out_of_bounds");
        if (item.ayahFrom < 1 || item.ayahTo > MAX_AYAH) problems.add("range_out_of_bounds");
        if (item.ayahTo < item.ayahFrom) problems.add("empty_range");
        break;
      }
      case "pages": {
        if (!isInteger(item.pageFrom) || !isInteger(item.pageTo)) {
          problems.add("range_out_of_bounds");
          break;
        }
        if (item.pageFrom < 1 || item.pageTo > MAX_PAGE) problems.add("range_out_of_bounds");
        if (item.pageTo < item.pageFrom) problems.add("empty_range");
        break;
      }
      case "lesson": {
        if (item.lessonId.trim() === "") problems.add("unknown_lesson");
        break;
      }
    }
  }

  const units = items.reduce((total, item) => total + unitsIn(item), 0);
  if (units > MAX_UNITS_PER_ASSIGNMENT) problems.add("too_many_units");

  if (problems.size > 0) {
    // Sorted by the declared order, so an error list never reshuffles itself.
    const ordered = SCOPE_PROBLEMS.filter((problem) => problems.has(problem));
    return { ok: false, problems: ordered };
  }
  return { ok: true, units };
}

/* -------------------------------------------------------------- the wizard */

export const WIZARD_STEPS = ["who", "what", "how", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/**
 * Settings a teacher locks. The learner cannot change any of them — that is the
 * point of the "How" step, and the reason they are stored on the assignment
 * rather than on the learner's preferences.
 */
export type LockedSettings = {
  readonly exercises: readonly string[];
  readonly reciterId: string;
  /** Repetitions before the exercise lets go. */
  readonly repetitions: number;
  /** Whether the learner may see the words while recalling. */
  readonly scaffold: "full" | "fading" | "none";
  /** Whether an oral verification is required to finish. */
  readonly requiresVerification: boolean;
};

export const DEFAULT_LOCKED_SETTINGS: LockedSettings = {
  exercises: ["listen", "recall_first", "rebuild"],
  reciterId: "husary",
  repetitions: 3,
  scaffold: "fading",
  requiresVerification: true,
};

export type WizardDraft = {
  readonly learnerUserIds: readonly string[];
  readonly track: AssignmentTrack;
  readonly scope: readonly ScopeItem[];
  readonly settings: LockedSettings;
  readonly dueAt: Date | null;
};

export function emptyDraft(track: AssignmentTrack = "hifz"): WizardDraft {
  return {
    learnerUserIds: [],
    track,
    scope: [],
    settings: DEFAULT_LOCKED_SETTINGS,
    dueAt: null,
  };
}

/** Whether a step has enough to move on. A step is never silently skippable. */
export function stepComplete(draft: WizardDraft, step: WizardStep): boolean {
  switch (step) {
    case "who":
      return draft.learnerUserIds.length > 0;
    case "what":
      return checkScope(draft.scope, draft.learnerUserIds.length > 0 ? draft.learnerUserIds : ["x"]).ok;
    case "how":
      return draft.settings.exercises.length > 0 && draft.settings.repetitions >= 1;
    case "review":
      return checkScope(draft.scope, draft.learnerUserIds).ok && draft.settings.exercises.length > 0;
  }
}

/** The furthest step a draft may legitimately reach. */
export function furthestStep(draft: WizardDraft): WizardStep {
  if (!stepComplete(draft, "who")) return "who";
  if (!stepComplete(draft, "what")) return "what";
  if (!stepComplete(draft, "how")) return "how";
  return "review";
}

/**
 * What each learner will actually see tomorrow, said as data.
 *
 * The review step renders this and nothing else — no summary is assembled in
 * JSX, so what the teacher reads is exactly what will be written down.
 */
export type ReviewLine = {
  readonly learnerUserId: string;
  readonly track: AssignmentTrack;
  readonly scope: readonly ScopeItem[];
  readonly units: number;
  readonly exercises: readonly string[];
  readonly requiresVerification: boolean;
  readonly dueAt: Date | null;
};

export function reviewLines(draft: WizardDraft): readonly ReviewLine[] {
  const units = draft.scope.reduce((total, item) => total + unitsIn(item), 0);
  return draft.learnerUserIds.map((learnerUserId) => ({
    learnerUserId,
    track: draft.track,
    scope: draft.scope,
    units,
    exercises: draft.settings.exercises,
    requiresVerification: draft.settings.requiresVerification,
    dueAt: draft.dueAt,
  }));
}
