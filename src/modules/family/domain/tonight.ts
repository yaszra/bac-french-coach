import type { DailyReport } from "../../analytics/domain/daily-report";
import { isMeasured, type Measured } from "../../analytics/domain/denominator";
import { suggestHomeTask, type HomeTask } from "./home-task";
import type { ApproverRole } from "./claim";

/**
 * Tonight — what a parent reads, standing in a kitchen, once a day.
 *
 * Three refusals are built into this shape:
 *   · One action per struggle. Never two, never a list to work through.
 *   · No comparison that was not measured. With no previous week there is no
 *     "up" and no "down"; there is a number of words held, and that is all.
 *   · No percentage without its denominator. A rate below the minimum is
 *     rendered as "not yet recorded", never as a smaller number.
 */

export type TonightAction = {
  readonly unitId: string;
  readonly reasonKey: string;
  /** Exactly one thing to do. */
  readonly actionKey: string;
};

export type TonightTrend =
  | { readonly kind: "no_comparison"; readonly wordsHeld: number }
  | {
      readonly kind: "comparison";
      readonly wordsHeld: number;
      readonly wordsHeldLastWeek: number;
      readonly deltaWords: number;
      readonly direction: "more" | "fewer" | "same";
    };

export type TonightApproval = {
  readonly unitCount: number;
  readonly approvedByName: string;
  readonly approverRole: ApproverRole;
};

export type Tonight = {
  readonly learnerUserId: string;
  readonly childName: string;
  readonly forDate: string;
  readonly state: "quiet" | "recorded";
  readonly headlineKey: string;
  readonly minutesPractised: number;
  readonly reviews: { readonly done: number; readonly due: number };
  readonly unassistedRecall: Measured;
  readonly actions: readonly TonightAction[];
  readonly trend: TonightTrend;
  readonly approvals: readonly TonightApproval[];
  readonly homeTask: HomeTask;
};

export function buildTonight(input: {
  report: DailyReport;
  childName: string;
  approvals?: readonly TonightApproval[];
}): Tonight {
  const { report } = input;
  const quiet = report.state === "nothing_recorded";

  const trend: TonightTrend =
    report.trend.wordsHeldLastWeek === null
      ? { kind: "no_comparison", wordsHeld: report.trend.wordsHeld }
      : {
          kind: "comparison",
          wordsHeld: report.trend.wordsHeld,
          wordsHeldLastWeek: report.trend.wordsHeldLastWeek,
          deltaWords: report.trend.wordsHeld - report.trend.wordsHeldLastWeek,
          direction:
            report.trend.wordsHeld > report.trend.wordsHeldLastWeek
              ? "more"
              : report.trend.wordsHeld < report.trend.wordsHeldLastWeek
                ? "fewer"
                : "same",
        };

  const actions: readonly TonightAction[] = report.struggles.map((struggle) => ({
    unitId: struggle.unitId,
    reasonKey: struggle.reasonKey,
    actionKey: struggle.suggestedActionKey,
  }));

  return {
    learnerUserId: report.learnerUserId,
    childName: input.childName,
    forDate: report.forDate,
    state: quiet ? "quiet" : "recorded",
    headlineKey: quiet ? "family.tonight.quietDay" : "family.tonight.headline",
    minutesPractised: report.minutesPractised,
    reviews: { done: report.reviewsDone, due: report.reviewsDue },
    unassistedRecall: report.unassistedRecall,
    actions,
    trend,
    approvals: input.approvals ?? [],
    homeTask: suggestHomeTask({
      struggleReasonKeys: report.struggles.map((s) => s.reasonKey),
      quietDay: quiet,
    }),
  };
}

/**
 * The recall line, as parts the UI renders — never a bare percentage. Below
 * the minimum there is no number at all, only how much more is needed.
 */
export function recallLine(recall: Measured):
  | { readonly kind: "measured"; readonly percent: number; readonly numerator: number; readonly denominator: number }
  | { readonly kind: "not_yet_recorded"; readonly denominator: number; readonly needed: number } {
  return isMeasured(recall)
    ? {
        kind: "measured",
        percent: Math.round(recall.value * 100),
        numerator: recall.numerator,
        denominator: recall.denominator,
      }
    : { kind: "not_yet_recorded", denominator: recall.denominator, needed: recall.needed };
}
