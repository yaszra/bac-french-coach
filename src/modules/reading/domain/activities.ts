/**
 * Practice activities and the evidence they produce.
 *
 * Two kinds, and the difference between them is the whole point:
 *
 * - **recognition** — the learner sees a form and chooses its name or sound. A
 *   machine can check this against the authored key, so it yields `machine_checked`
 *   evidence. It proves recognition, which is not the same thing as reading.
 * - **production** — the learner *says it*. No machine grades that as mastery here.
 *   The evidence is an observation: a teacher who heard it (`teacher_observed`), a
 *   solo learner attesting to their own reading (`self_confirmed`), or an on-device
 *   listening aid offering an opinion (`advisory_only`). Only the first is
 *   mastery-bearing; see `evidence.ts`.
 *
 * ## No punishment mechanics
 *
 * There are no hearts, no timers, no streak penalties and no score deductions in this
 * module, and the types make that structural rather than aspirational:
 * `ActivityEvaluation.penalty` has type `null` — there is no value it could hold —
 * and `PRACTICE_GUARANTEES` is typed with literal `false`s. A wrong answer returns a
 * `correction`: a message key naming *what to notice* (the dots moved, the two
 * letters share a makhraj), never a rebuke and never a cost.
 *
 * Response times are recorded because a teacher may want to know that answers are
 * arriving faster than anyone can read (see `anomalies.ts`); they never gate an
 * activity and never reduce a score.
 *
 * Pure module: no I/O, no clock, no randomness. Distractor choice and answer
 * placement are deterministic functions of the activity id.
 */

import { reason, type Reason } from "@/modules/memory/domain/types";

import {
  conceptById,
  letterById,
  type ConceptId,
  type ReadingLattice,
} from "./concepts";
import { confusableWith, confusionScore, facetsOf, type Distractor } from "./confusion";
import {
  type ActivityKind,
  type ConceptObservation,
  type EvidenceKind,
  type Presentation,
} from "./evidence";

/** Structural promise, not a slogan: these fields can only ever be `false`. */
export interface PracticeGuarantees {
  readonly hearts: false;
  readonly timers: false;
  readonly streakPenalties: false;
  readonly scoreDeductions: false;
}

export const PRACTICE_GUARANTEES: PracticeGuarantees = {
  hearts: false,
  timers: false,
  streakPenalties: false,
  scoreDeductions: false,
};

/* ---------------------------------------------------------------- activities */

export interface RecognitionChoice {
  readonly choiceId: string;
  readonly conceptId: ConceptId;
}

export interface RecognitionActivity {
  readonly kind: "recognition";
  readonly activityId: string;
  /** The concept under test. */
  readonly conceptId: ConceptId;
  readonly presentation: Presentation;
  /** Bare codepoints shown to the learner — never a word, never a phrase. */
  readonly promptCodepoints: readonly string[];
  readonly choices: readonly RecognitionChoice[];
  readonly answerChoiceId: string;
}

export interface ProductionActivity {
  readonly kind: "production";
  readonly activityId: string;
  readonly conceptId: ConceptId;
  readonly presentation: Presentation;
  readonly promptCodepoints: readonly string[];
  /** Whether a teacher is expected to observe. Solo learners self-confirm. */
  readonly observedBy: "teacher" | "self";
}

export type ReadingActivity = RecognitionActivity | ProductionActivity;

/** FNV-1a — a tiny, stable hash so answer placement is deterministic, not random. */
function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface RecognitionBuildOptions {
  readonly activityId: string;
  readonly conceptId: ConceptId;
  /** Total on-screen choices, answer included. Clamped to 2..8. */
  readonly choiceCount?: number;
  readonly presentation?: Presentation;
  readonly exclude?: readonly ConceptId[];
  readonly lattice?: ReadingLattice;
}

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 8;
export const DEFAULT_CHOICE_COUNT = 4;

/** The codepoints a concept shows on screen, or an empty list when it shows none. */
export function promptCodepointsOf(conceptId: ConceptId): readonly string[] {
  return conceptById(conceptId)?.letterCodepoints ?? [];
}

/**
 * Build a recognition activity. Distractors come from `confusableWith`, so they are
 * plausible; the answer is never among them, and the answer's position is a stable
 * function of the activity id rather than a random draw — the same activity id always
 * lays out the same way, which is what makes a session reproducible for a teacher
 * reviewing what a learner actually saw.
 */
export function buildRecognitionActivity(
  options: RecognitionBuildOptions,
): RecognitionActivity {
  const choiceCount = Math.min(
    MAX_CHOICES,
    Math.max(MIN_CHOICES, Math.floor(options.choiceCount ?? DEFAULT_CHOICE_COUNT)),
  );
  const distractors: readonly Distractor[] = confusableWith(
    options.conceptId,
    choiceCount - 1,
    {
      ...(options.exclude === undefined ? {} : { exclude: options.exclude }),
      ...(options.lattice === undefined ? {} : { lattice: options.lattice }),
    },
  );

  const conceptIds = distractors.map((distractor) => distractor.conceptId);
  const position = stableHash(options.activityId) % (conceptIds.length + 1);
  const ordered = [
    ...conceptIds.slice(0, position),
    options.conceptId,
    ...conceptIds.slice(position),
  ];

  const choices = ordered.map(
    (conceptId, index): RecognitionChoice => ({
      choiceId: `${options.activityId}:${index}`,
      conceptId,
    }),
  );
  const answer = choices[position];

  return {
    kind: "recognition",
    activityId: options.activityId,
    conceptId: options.conceptId,
    presentation: options.presentation ?? "ordered",
    promptCodepoints: promptCodepointsOf(options.conceptId),
    choices,
    answerChoiceId: answer?.choiceId ?? `${options.activityId}:0`,
  };
}

export interface ProductionBuildOptions {
  readonly activityId: string;
  readonly conceptId: ConceptId;
  readonly presentation?: Presentation;
  readonly observedBy?: "teacher" | "self";
}

export function buildProductionActivity(
  options: ProductionBuildOptions,
): ProductionActivity {
  return {
    kind: "production",
    activityId: options.activityId,
    conceptId: options.conceptId,
    presentation: options.presentation ?? "in_person",
    promptCodepoints: promptCodepointsOf(options.conceptId),
    observedBy: options.observedBy ?? "teacher",
  };
}

/* ----------------------------------------------------------------- responses */

export interface RecognitionResponse {
  readonly kind: "recognition";
  readonly activityId: string;
  readonly choiceId: string;
  readonly at: Date;
  readonly sessionId: string;
  /** Wall time to answer. Recorded for a teacher's attention, never to punish. */
  readonly elapsedMs?: number;
}

export const PRODUCTION_OBSERVERS = ["teacher", "self", "advisory_listener"] as const;
export type ProductionObserver = (typeof PRODUCTION_OBSERVERS)[number];

export const PRODUCTION_VERDICTS = ["clear", "needs_work", "not_observed"] as const;
export type ProductionVerdict = (typeof PRODUCTION_VERDICTS)[number];

export interface ProductionResponse {
  readonly kind: "production";
  readonly activityId: string;
  readonly observer: ProductionObserver;
  readonly verdict: ProductionVerdict;
  readonly at: Date;
  readonly sessionId: string;
  /** Identity of the observing teacher, when there was one. */
  readonly observerId?: string;
  readonly elapsedMs?: number;
}

export type ActivityResponse = RecognitionResponse | ProductionResponse;

/** Which evidence kind an observer's word produces. There is no fourth option. */
export const OBSERVER_EVIDENCE: Readonly<Record<ProductionObserver, EvidenceKind>> = {
  teacher: "teacher_observed",
  self: "self_confirmed",
  advisory_listener: "advisory_only",
};

/* ---------------------------------------------------------------- evaluation */

export type BearingPolarity = "supports" | "contradicts" | "neutral";

export interface ConceptBearing {
  readonly conceptId: ConceptId;
  readonly polarity: BearingPolarity;
  /** 0..1 — how much of this observation bears on this concept. */
  readonly weight: number;
}

/** What to notice next time. A message key and its params — never literal text. */
export interface Correction {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, string | number>>;
}

export const CORRECTION_KEYS = {
  noticeTheDots: "reading.correction.notice_the_dots",
  noticeTheShape: "reading.correction.notice_the_shape",
  noticeTheMakhraj: "reading.correction.notice_the_makhraj",
  noticeTheVowel: "reading.correction.notice_the_vowel",
  knownPair: "reading.correction.known_pair",
  lookAgain: "reading.correction.look_again",
  productionNeedsWork: "reading.correction.production_needs_work",
} as const;

export interface ActivityEvaluation {
  readonly activityId: string;
  readonly kind: ActivityKind;
  readonly conceptId: ConceptId;
  /** `null` when nothing was decided — an unobserved production, or a bad pairing. */
  readonly correct: boolean | null;
  readonly evidenceKind: EvidenceKind;
  /** True only for evidence this platform lets move a mastery estimate. */
  readonly countsTowardMastery: boolean;
  /** The concepts this one observation actually speaks to. */
  readonly bearsOn: readonly ConceptBearing[];
  /** What to notice. Present on a miss, `null` on a hit. */
  readonly correction: Correction | null;
  /** There is no punishment. This field exists to make that unfalsifiable. */
  readonly penalty: null;
  /** The record to append, when this response produced evidence at all. */
  readonly observation: ConceptObservation | null;
  readonly reason: Reason;
}

function observationOf(
  activity: ReadingActivity,
  response: ActivityResponse,
  correct: boolean,
  evidenceKind: EvidenceKind,
  chosenConceptId: ConceptId | null,
): ConceptObservation {
  return {
    conceptId: activity.conceptId,
    correct,
    at: response.at,
    activityKind: activity.kind,
    evidenceKind,
    presentation: activity.presentation,
    sessionId: response.sessionId,
    ...(response.elapsedMs === undefined ? {} : { elapsedMs: response.elapsedMs }),
    ...(chosenConceptId === null ? {} : { chosenConceptId }),
  };
}

function dotsDescription(conceptId: ConceptId): string {
  const letter = letterById(facetsOf(conceptId).letter?.id ?? conceptId);
  if (letter === null) return "none";
  return `${letter.dots.count}:${letter.dots.position}`;
}

/** Turn a wrong recognition choice into "what to notice", using the confusion model. */
export function correctionFor(answerId: ConceptId, chosenId: ConceptId): Correction {
  const result = confusionScore(answerId, chosenId);
  const answer = facetsOf(answerId);
  const chosen = facetsOf(chosenId);

  if (result.components.vowel > 0) {
    return {
      messageKey: CORRECTION_KEYS.noticeTheVowel,
      params: { expected: answerId, chosen: chosenId },
    };
  }
  if (
    answer.letter !== null &&
    chosen.letter !== null &&
    answer.letter.skeleton === chosen.letter.skeleton
  ) {
    return {
      messageKey: CORRECTION_KEYS.noticeTheDots,
      params: {
        expected: answerId,
        chosen: chosenId,
        expectedDots: dotsDescription(answerId),
        chosenDots: dotsDescription(chosenId),
      },
    };
  }
  if (result.components.makhraj >= 0.6 && answer.letter !== null) {
    return {
      messageKey: CORRECTION_KEYS.noticeTheMakhraj,
      params: { expected: answerId, chosen: chosenId, makhraj: answer.letter.makhraj },
    };
  }
  if (result.components.misconception > 0) {
    const key = result.reasons[result.reasons.length - 1]?.key ?? CORRECTION_KEYS.knownPair;
    return {
      messageKey: CORRECTION_KEYS.knownPair,
      params: { expected: answerId, chosen: chosenId, pair: key },
    };
  }
  if (answer.letter !== null && chosen.letter !== null) {
    return {
      messageKey: CORRECTION_KEYS.noticeTheShape,
      params: { expected: answerId, chosen: chosenId },
    };
  }
  return {
    messageKey: CORRECTION_KEYS.lookAgain,
    params: { expected: answerId, chosen: chosenId },
  };
}

function mismatch(activity: ReadingActivity, response: ActivityResponse): ActivityEvaluation {
  return {
    activityId: activity.activityId,
    kind: activity.kind,
    conceptId: activity.conceptId,
    correct: null,
    evidenceKind: "advisory_only",
    countsTowardMastery: false,
    bearsOn: [],
    correction: null,
    penalty: null,
    observation: null,
    reason: reason("reading.activity.reason.response_does_not_match_activity", {
      activityId: activity.activityId,
      activityKind: activity.kind,
      responseKind: response.kind,
    }),
  };
}

/**
 * Evaluate one response against the activity that produced it.
 *
 * Never throws, never punishes, and never grades a spoken answer as mastery. A
 * response that does not belong to its activity yields `correct: null` and no
 * observation rather than a guess.
 */
export function evaluateActivity(
  activity: ReadingActivity,
  response: ActivityResponse,
): ActivityEvaluation {
  if (activity.kind !== response.kind || activity.activityId !== response.activityId) {
    return mismatch(activity, response);
  }

  if (activity.kind === "recognition" && response.kind === "recognition") {
    const chosen = activity.choices.find((choice) => choice.choiceId === response.choiceId);
    const correct = response.choiceId === activity.answerChoiceId;
    const chosenConceptId = chosen?.conceptId ?? null;

    const bearsOn: ConceptBearing[] = [
      { conceptId: activity.conceptId, polarity: correct ? "supports" : "contradicts", weight: 1 },
    ];
    // A miss also tells us something about the concept that *was* picked: the learner
    // read the prompt as that one. It is weak evidence, and it is not mastery.
    if (!correct && chosenConceptId !== null && chosenConceptId !== activity.conceptId) {
      bearsOn.push({ conceptId: chosenConceptId, polarity: "neutral", weight: 0.25 });
    }

    return {
      activityId: activity.activityId,
      kind: "recognition",
      conceptId: activity.conceptId,
      correct,
      evidenceKind: "machine_checked",
      countsTowardMastery: true,
      bearsOn,
      correction: correct
        ? null
        : correctionFor(activity.conceptId, chosenConceptId ?? activity.conceptId),
      penalty: null,
      observation: observationOf(
        activity,
        response,
        correct,
        "machine_checked",
        chosenConceptId,
      ),
      reason: reason(
        correct
          ? "reading.activity.reason.recognition_matched_key"
          : "reading.activity.reason.recognition_did_not_match_key",
        { conceptId: activity.conceptId },
      ),
    };
  }

  if (activity.kind === "production" && response.kind === "production") {
    const evidenceKind = OBSERVER_EVIDENCE[response.observer];
    // Only a human who can hear the learner moves mastery. A self-confirmation is
    // recorded and kept visibly distinct; an advisory listener is never mastery.
    const countsTowardMastery = evidenceKind === "teacher_observed";

    if (response.verdict === "not_observed") {
      return {
        activityId: activity.activityId,
        kind: "production",
        conceptId: activity.conceptId,
        correct: null,
        evidenceKind,
        countsTowardMastery: false,
        bearsOn: [],
        correction: null,
        penalty: null,
        observation: null,
        reason: reason("reading.activity.reason.production_not_yet_observed", {
          conceptId: activity.conceptId,
          observer: response.observer,
        }),
      };
    }

    const correct = response.verdict === "clear";
    const conceptMakhraj = conceptById(activity.conceptId)?.makhraj ?? "";
    return {
      activityId: activity.activityId,
      kind: "production",
      conceptId: activity.conceptId,
      correct,
      evidenceKind,
      countsTowardMastery,
      bearsOn: [
        {
          conceptId: activity.conceptId,
          polarity: correct ? "supports" : "contradicts",
          weight: countsTowardMastery ? 1 : 0.35,
        },
      ],
      correction: correct
        ? null
        : {
            messageKey: CORRECTION_KEYS.productionNeedsWork,
            params: { conceptId: activity.conceptId, makhraj: conceptMakhraj },
          },
      penalty: null,
      observation: observationOf(activity, response, correct, evidenceKind, null),
      reason: reason("reading.activity.reason.production_observed", {
        conceptId: activity.conceptId,
        observer: response.observer,
        evidenceKind,
      }),
    };
  }

  return mismatch(activity, response);
}
