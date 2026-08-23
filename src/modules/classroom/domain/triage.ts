/**
 * Triage — deciding, honestly, which students need a teacher today.
 *
 * A teacher opens the console with twenty minutes and thirty students. The
 * question is not "how is the class doing"; it is "who, and why, and in what
 * order". This module answers exactly that, and nothing else.
 *
 * Three rules shape every line below.
 *
 *  · **The reason is data.** A row never carries a sentence. It carries a
 *    `kind`, an intensity, and the parameters a message needs. The console
 *    renders it through the message bundle; a report can group by it; a test
 *    can assert on it. Nothing here ever assembles prose.
 *
 *  · **Never accuse.** The reason kinds name a SITUATION, not a person's
 *    failing: `reviews_overdue`, not "lazy"; `activity_gap`, not "absent".
 *    A learner who has recorded nothing does not get an idle row, because
 *    "idle for 6 days" would be a claim about someone we have not observed.
 *
 *  · **Pure.** No clock, no database, no locale. `now` is an argument. Given
 *    the same signals the ranking is byte-identical, which is what lets the
 *    inbox be tested and lets two teachers see the same list.
 */

/* --------------------------------------------------------------- vocabulary */

/**
 * Why a learner is on the list. Ordered by how much a person is BLOCKED on the
 * teacher: a learner waiting for a verdict cannot proceed at all; a learner
 * whose reviews are piling up can still work.
 */
export const TRIAGE_REASONS = [
  "verification_waiting",
  "guardian_claim_waiting",
  "repeated_lapses",
  "reviews_overdue",
  "activity_gap",
  "recommendation_unacted",
  "recommendation_acted",
] as const;

export type TriageReasonKind = (typeof TRIAGE_REASONS)[number];

/**
 * Priority order, and the bands it produces.
 *
 * `TRIAGE_REASONS` is declared strongest-first, and each kind owns an equal,
 * NON-OVERLAPPING slice of 0..1. That is the whole trick: intensity moves a
 * reason inside its own band and can never carry it into the band above.
 *
 * `verification_waiting` leads because a learner who asked to be heard is
 * stopped until a person listens — the ear-gate is the one thing only a human
 * can do. `recommendation_acted` is last because it is good news: worth a
 * glance, never worth displacing someone who is stuck. Without the bands, a
 * large enough review backlog would eventually outweigh a person waiting, and
 * that is precisely the arithmetic a teacher's inbox must not do.
 */
const REASON_RANK: Readonly<Record<TriageReasonKind, number>> = Object.fromEntries(
  TRIAGE_REASONS.map((kind, index) => [kind, index]),
) as Record<TriageReasonKind, number>;

/** Width of one band. Seven kinds, seven equal slices of the 0..1 range. */
const BAND = 1 / TRIAGE_REASONS.length;

/**
 * Bounds are rounded to the same four decimals every score is, so that
 * "this kind's ceiling is that kind's floor" is exactly true in arithmetic and
 * not merely nearly true — a boundary comparison must never turn on a float.
 */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** The floor of a kind's band — the score it scores at intensity zero. */
export const REASON_FLOOR: Readonly<Record<TriageReasonKind, number>> = Object.fromEntries(
  TRIAGE_REASONS.map((kind, index) => [kind, round((TRIAGE_REASONS.length - 1 - index) * BAND)]),
) as Record<TriageReasonKind, number>;

/** The ceiling of a kind's band — the score it scores at full intensity. */
export const REASON_CEILING: Readonly<Record<TriageReasonKind, number>> = Object.fromEntries(
  TRIAGE_REASONS.map((kind, index) => [kind, round((TRIAGE_REASONS.length - index) * BAND)]),
) as Record<TriageReasonKind, number>;

/**
 * A reason, ready to render. `params` are numbers only — never a name, never a
 * piece of text, and never Arabic.
 */
export type TriageReason = {
  readonly kind: TriageReasonKind;
  /** i18n key, resolved by the console. Never the sentence itself. */
  readonly messageKey: string;
  /** 0..1. How pressing this instance is, within its kind. */
  readonly intensity: number;
  /** 0..1. Rank contribution: weight tempered by intensity. */
  readonly score: number;
  readonly params: Readonly<Record<string, number>>;
};

/* ------------------------------------------------------------------ signals */

/** A recommendation the engine made for this learner. */
export type RecommendationSignal = {
  /** The engine's own action key, e.g. "review_due". Rendered, never invented. */
  readonly action: string;
  readonly createdAt: Date;
  /** When the learner acted on it, or null while it still stands. */
  readonly actedAt: Date | null;
};

/**
 * Everything the ranking is allowed to know about one learner.
 *
 * Every field is either a count or a moment. Nothing here is a judgement, and
 * nothing here is text: the repo reads facts, this module weighs them.
 */
export type TriageSignals = {
  readonly learnerUserId: string;
  /** The oldest pending oral request, if one is waiting. */
  readonly pendingVerificationSince: Date | null;
  /** An unapproved guardian claim on this learner, if one is waiting. */
  readonly guardianClaimSince: Date | null;
  /** Units that lapsed inside the lapse window. */
  readonly lapsesInWindow: number;
  /** Reviews already due. Reported with its denominator by the caller. */
  readonly overdueReviews: number;
  /** Units with any recorded state — the denominator for `overdueReviews`. */
  readonly trackedUnits: number;
  /** The moment the oldest overdue review fell due, or null when none are. */
  readonly oldestDueAt: Date | null;
  /** Last recorded evidence of any kind, or null when nothing is recorded. */
  readonly lastActivityAt: Date | null;
  readonly recommendation: RecommendationSignal | null;
};

/** An empty signal set — the shape a learner with no recorded evidence has. */
export function noSignals(learnerUserId: string): TriageSignals {
  return {
    learnerUserId,
    pendingVerificationSince: null,
    guardianClaimSince: null,
    lapsesInWindow: 0,
    overdueReviews: 0,
    trackedUnits: 0,
    oldestDueAt: null,
    lastActivityAt: null,
    recommendation: null,
  };
}

/* ------------------------------------------------------------------- config */

export type TriageConfig = {
  /** Hours a pending oral request takes to reach full urgency. */
  readonly verificationAgingHours: number;
  /** Hours an unapproved guardian claim takes to reach full urgency. */
  readonly claimAgingHours: number;
  /** Lapses inside the window before it is worth a teacher's attention. */
  readonly minLapses: number;
  /** Lapses at which the situation is as pressing as it gets. */
  readonly severeLapses: number;
  /** Overdue reviews before it is worth a row at all. */
  readonly minOverdueReviews: number;
  /** Overdue reviews at which the backlog is as pressing as it gets. */
  readonly severeOverdueReviews: number;
  /** Days past due at which staleness alone reaches full intensity. */
  readonly severeOverdueDays: number;
  /** Days without recorded evidence before a gap is worth naming. */
  readonly idleDays: number;
  /** Days without recorded evidence at which the gap is as pressing as it gets. */
  readonly severeIdleDays: number;
  /** Days an unacted recommendation takes to reach full urgency. */
  readonly recommendationStaleDays: number;
  /** Days within which acting on a recommendation is still worth noticing. */
  readonly recommendationFreshDays: number;
  /** Rows the inbox shows. The rest are counted, never hidden silently. */
  readonly limit: number;
};

export const DEFAULT_TRIAGE_CONFIG: TriageConfig = {
  verificationAgingHours: 48,
  claimAgingHours: 72,
  minLapses: 2,
  severeLapses: 5,
  minOverdueReviews: 1,
  severeOverdueReviews: 20,
  severeOverdueDays: 7,
  idleDays: 4,
  severeIdleDays: 14,
  recommendationStaleDays: 3,
  recommendationFreshDays: 2,
  limit: 5,
};

/* ------------------------------------------------------------------- maths */

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_HOUR;
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

/** A kind's band floor, plus intensity's share of the band's width. */
function scoreOf(kind: TriageReasonKind, intensity: number): number {
  const bounded = clamp01(intensity);
  // Pin the ends to the published bounds so a full-intensity reason scores its
  // ceiling exactly, and the band below it scores that ceiling as its floor.
  if (bounded >= 1) return REASON_CEILING[kind];
  return round(REASON_FLOOR[kind] + BAND * bounded);
}

function makeReason(
  kind: TriageReasonKind,
  intensity: number,
  params: Readonly<Record<string, number>>,
): TriageReason {
  const bounded = round(clamp01(intensity));
  return {
    kind,
    messageKey: `triage.reason.${kind}`,
    intensity: bounded,
    score: scoreOf(kind, bounded),
    params,
  };
}

/* ------------------------------------------------------------------ reasons */

/**
 * Every reason this learner's signals justify, strongest first.
 *
 * A signal that does not clear its threshold produces nothing at all. There is
 * no "mild" row: an inbox that lists everybody is an inbox nobody reads.
 */
export function reasonsFor(
  signals: TriageSignals,
  now: Date,
  config: TriageConfig = DEFAULT_TRIAGE_CONFIG,
): readonly TriageReason[] {
  const reasons: TriageReason[] = [];

  if (signals.pendingVerificationSince !== null) {
    const hours = Math.max(0, hoursBetween(signals.pendingVerificationSince, now));
    reasons.push(
      makeReason("verification_waiting", hours / config.verificationAgingHours, {
        hoursWaiting: Math.floor(hours),
      }),
    );
  }

  if (signals.guardianClaimSince !== null) {
    const hours = Math.max(0, hoursBetween(signals.guardianClaimSince, now));
    reasons.push(
      makeReason("guardian_claim_waiting", hours / config.claimAgingHours, {
        hoursWaiting: Math.floor(hours),
      }),
    );
  }

  if (signals.lapsesInWindow >= config.minLapses) {
    const span = Math.max(1, config.severeLapses - config.minLapses);
    reasons.push(
      makeReason("repeated_lapses", (signals.lapsesInWindow - config.minLapses) / span, {
        lapses: signals.lapsesInWindow,
      }),
    );
  }

  if (signals.overdueReviews >= config.minOverdueReviews) {
    const byCount = signals.overdueReviews / config.severeOverdueReviews;
    const byAge =
      signals.oldestDueAt === null
        ? 0
        : Math.max(0, daysBetween(signals.oldestDueAt, now)) / config.severeOverdueDays;
    reasons.push(
      makeReason("reviews_overdue", Math.max(byCount, byAge), {
        // The denominator travels with the count: "9 of 140", never "9".
        overdue: signals.overdueReviews,
        tracked: signals.trackedUnits,
        daysOverdue:
          signals.oldestDueAt === null
            ? 0
            : Math.max(0, Math.floor(daysBetween(signals.oldestDueAt, now))),
      }),
    );
  }

  /* An activity gap is only claimable when there is a last activity to measure
     from. A learner who has recorded nothing is "not yet recorded", which is a
     different situation and belongs on the roster, not in triage. */
  if (signals.lastActivityAt !== null) {
    const days = daysBetween(signals.lastActivityAt, now);
    if (days >= config.idleDays) {
      const span = Math.max(1, config.severeIdleDays - config.idleDays);
      reasons.push(
        makeReason("activity_gap", (days - config.idleDays) / span, { days: Math.floor(days) }),
      );
    }
  }

  const recommendation = signals.recommendation;
  if (recommendation !== null) {
    if (recommendation.actedAt === null) {
      const days = Math.max(0, daysBetween(recommendation.createdAt, now));
      reasons.push(
        makeReason("recommendation_unacted", days / config.recommendationStaleDays, {
          days: Math.floor(days),
        }),
      );
    } else {
      const days = Math.max(0, daysBetween(recommendation.actedAt, now));
      if (days <= config.recommendationFreshDays) {
        reasons.push(
          makeReason("recommendation_acted", 1 - days / Math.max(1, config.recommendationFreshDays), {
            days: Math.floor(days),
          }),
        );
      }
    }
  }

  return sortReasons(reasons);
}

function sortReasons(reasons: readonly TriageReason[]): readonly TriageReason[] {
  return [...reasons].sort(
    (a, b) => b.score - a.score || REASON_RANK[a.kind] - REASON_RANK[b.kind],
  );
}

/* -------------------------------------------------------------------- rows */

export type TriageItem = {
  readonly learnerUserId: string;
  /** Strongest first. Always at least one — a learner with none is not listed. */
  readonly reasons: readonly TriageReason[];
  /** The reason the row leads with. */
  readonly leadReason: TriageReason;
  /** 0..1. Rank only: it is an ordering, not a measurement of a learner. */
  readonly score: number;
};

export type TriageInbox = {
  readonly items: readonly TriageItem[];
  /** Learners who cleared the bar but fell outside `limit`. Never hidden silently. */
  readonly moreCount: number;
  /** Learners considered — the denominator of "5 of 30 need you today". */
  readonly considered: number;
  readonly at: Date;
};

/**
 * A row scores exactly what its strongest reason scores.
 *
 * Co-occurrence is deliberately NOT arithmetic. Adding a bonus per extra
 * reason would let four mild situations creep past a learner who is blocked,
 * so having more reasons is a TIE-BREAK instead: among rows that score the
 * same, the one carrying more is shown first. It can never jump a band.
 */
export function scoreItem(reasons: readonly TriageReason[]): number {
  return sortReasons(reasons)[0]?.score ?? 0;
}

/**
 * Rank the class.
 *
 * Deterministic to the last tie-break: score, then the lead reason's own rank,
 * then the learner id. Two teachers looking at the same class at the same
 * moment see the same list in the same order.
 */
export function rankTriage(
  signals: readonly TriageSignals[],
  now: Date,
  config: TriageConfig = DEFAULT_TRIAGE_CONFIG,
): TriageInbox {
  const rows: TriageItem[] = [];

  for (const learner of signals) {
    const reasons = reasonsFor(learner, now, config);
    const lead = reasons[0];
    if (lead === undefined) continue;
    rows.push({
      learnerUserId: learner.learnerUserId,
      reasons,
      leadReason: lead,
      score: scoreItem(reasons),
    });
  }

  rows.sort(
    (a, b) =>
      b.score - a.score ||
      REASON_RANK[a.leadReason.kind] - REASON_RANK[b.leadReason.kind] ||
      b.reasons.length - a.reasons.length ||
      (a.learnerUserId < b.learnerUserId ? -1 : a.learnerUserId > b.learnerUserId ? 1 : 0),
  );

  const limit = Math.max(0, config.limit);
  return {
    items: rows.slice(0, limit),
    moreCount: Math.max(0, rows.length - limit),
    considered: signals.length,
    at: now,
  };
}
