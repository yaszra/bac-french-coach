import { rate, type Measured } from "./denominator";
import { stillWaiting, verifyLatency, type LatencySummary, type VerificationSample, type WaitingSummary } from "./verify-latency";

/**
 * The school view: sentences and ranked lists, not an analyst's dashboard.
 *
 * An administrator needs to know whether children are being heard, whether
 * teachers are actually using the thing, and which learners have been missed.
 * None of that is a chart. Every figure carries the period it covers and the
 * count it was computed from, and an admin sees aggregates — never a child's
 * recitation, never a recording.
 */

export type Period = { readonly from: Date; readonly to: Date; readonly days: number };

export function periodOf(to: Date, days: number): Period {
  return { from: new Date(to.getTime() - days * 86_400_000), to, days };
}

export type Figure = {
  readonly key: string;
  readonly count: number;
  readonly denominator: number;
  readonly measured: Measured;
};

export type RankedRow = {
  readonly id: string;
  readonly labelKey?: string;
  readonly label: string;
  readonly value: number;
  readonly denominator: number;
};

export type SchoolOverview = {
  readonly period: Period;
  readonly enrolment: Figure;
  readonly activeLearners: Figure;
  readonly teacherUsage: Figure;
  readonly latency: LatencySummary;
  readonly waiting: WaitingSummary;
  readonly coverage: readonly RankedRow[];
  readonly interventions: readonly RankedRow[];
  readonly dataRequests: {
    readonly received: number;
    readonly running: number;
    readonly completed: number;
    readonly failed: number;
  };
};

export type SchoolOverviewInput = {
  readonly period: Period;
  readonly learnersEnrolled: number;
  readonly learnersOnRoll: number;
  readonly learnersActive: number;
  readonly teachersWhoVerified: number;
  readonly teachers: number;
  readonly verifications: readonly VerificationSample[];
  readonly coverage: readonly RankedRow[];
  readonly interventions: readonly RankedRow[];
  readonly dataRequests: SchoolOverview["dataRequests"];
  readonly now: Date;
};

export function buildSchoolOverview(input: SchoolOverviewInput): SchoolOverview {
  return {
    period: input.period,
    enrolment: figure("school.figure.enrolment", input.learnersEnrolled, input.learnersOnRoll),
    activeLearners: figure("school.figure.active", input.learnersActive, input.learnersEnrolled),
    teacherUsage: figure("school.figure.teacherUsage", input.teachersWhoVerified, input.teachers),
    latency: verifyLatency(input.verifications),
    waiting: stillWaiting(input.verifications, input.now),
    // Ranked lists are truncated where a reader stops reading, not where the
    // data stops: a list of forty rows is a list nobody acts on.
    coverage: [...input.coverage].sort((a, b) => a.value - b.value).slice(0, 5),
    interventions: [...input.interventions].sort((a, b) => b.value - a.value).slice(0, 5),
    dataRequests: input.dataRequests,
  };
}

function figure(key: string, count: number, denominator: number): Figure {
  return { key, count, denominator, measured: rate(count, denominator) };
}
