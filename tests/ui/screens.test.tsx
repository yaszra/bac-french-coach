/**
 * @vitest-environment jsdom
 *
 * Screen behaviour — acceptance criteria 2 and 13, and the honest-reporting
 * rules from docs/16.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "../../src/ui/i18n/context.js";
import { LearnerToday } from "../../src/ui/components/LearnerToday.js";
import { AttentionInbox } from "../../src/ui/components/AttentionInbox.js";
import { ParentReport } from "../../src/ui/components/ParentReport.js";
import { buildTodayPlan, type Candidate } from "../../src/core/recommend.js";
import {
  ATTENTION_ORDER,
  buildAttentionInbox,
  type LearnerSnapshot,
} from "../../src/core/attention.js";
import { initialState } from "../../src/core/scheduler.js";
import { MS_PER_DAY, type LearnerId, type MemoryTargetId } from "../../src/core/types.js";

const NOW = Date.UTC(2026, 1, 10, 9, 0, 0);
const ago = (d: number) => NOW - d * MS_PER_DAY;

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    targetId: "tgt-1" as MemoryTargetId,
    kind: "segment",
    state: "assigned",
    label: "Al-Mulk 12-15",
    estimatedActiveMinutes: 6,
    teacherPriority: 0,
    unresolvedCorrections: 0,
    correctionRecurrences: 0,
    prerequisiteWeakness: 0,
    connectionWeakness: 0,
    isAssignmentObligation: true,
    ...over,
  };
}

function snapshot(over: Partial<LearnerSnapshot> = {}): LearnerSnapshot {
  return {
    learnerId: "l1" as LearnerId,
    displayName: "Amina S.",
    pendingVerifications: [],
    corrections: [],
    assignments: [],
    dueReviewCount: 0,
    overdueReviewCount: 0,
    lastActiveAt: NOW,
    delayedRecalls: [],
    governanceRequests: [],
    ...over,
  };
}

const renderToday = (plan: ReturnType<typeof buildTodayPlan>, onStart = vi.fn()) => {
  render(
    <LocaleProvider locale="en">
      <LearnerToday plan={plan} effortTargetMinutes={12} onStart={onStart} />
    </LocaleProvider>,
  );
  return onStart;
};

describe("criterion 2 — Today offers one clear next action", () => {
  it("marks exactly one action as primary", () => {
    const plan = buildTodayPlan(
      [
        candidate({ targetId: "a" as MemoryTargetId }),
        candidate({
          targetId: "b" as MemoryTargetId,
          state: "fragile",
          isAssignmentObligation: false,
          scheduling: initialState(true, ago(30)),
        }),
      ],
      { now: NOW, sessionBudgetMinutes: 30 },
    );
    const { container } = render(
      <LocaleProvider locale="en">
        <LearnerToday plan={plan} effortTargetMinutes={12} onStart={vi.fn()} />
      </LocaleProvider>,
    );
    expect(container.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
  });

  it("shows the reason on every card, not only the primary one", () => {
    const plan = buildTodayPlan(
      [
        candidate({ targetId: "a" as MemoryTargetId }),
        candidate({
          targetId: "b" as MemoryTargetId,
          state: "verified",
          isAssignmentObligation: false,
          scheduling: initialState(true, ago(20)),
        }),
      ],
      { now: NOW, sessionBudgetMinutes: 30 },
    );
    const { container } = render(
      <LocaleProvider locale="en">
        <LearnerToday plan={plan} effortTargetMinutes={12} onStart={vi.fn()} />
      </LocaleProvider>,
    );
    const cards = [...container.querySelectorAll(".athar-card")];
    expect(cards.length).toBeGreaterThan(1);
    for (const card of cards)
      expect(card.querySelector(".athar-card__reason")?.textContent).toBeTruthy();
  });

  it("starts the chosen target", async () => {
    const user = userEvent.setup();
    const plan = buildTodayPlan([candidate()], { now: NOW, sessionBudgetMinutes: 30 });
    const onStart = renderToday(plan);
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(onStart).toHaveBeenCalledWith("tgt-1");
  });

  it("reports a quiet day as a quiet day", () => {
    const plan = buildTodayPlan([], { now: NOW, sessionBudgetMinutes: 30 });
    renderToday(plan);
    expect(screen.getByText(/quiet day, not a missed one/)).toBeInTheDocument();
  });

  it("tells the learner what was deferred rather than hiding it", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      candidate({
        targetId: `t${i}` as MemoryTargetId,
        state: "verified",
        isAssignmentObligation: false,
        estimatedActiveMinutes: 6,
        scheduling: initialState(true, ago(25)),
      }),
    );
    const plan = buildTodayPlan(many, { now: NOW, sessionBudgetMinutes: 12 });
    renderToday(plan);
    expect(screen.getByText(/not marked complete/)).toBeInTheDocument();
  });

  it("shows an effort target, not a screen-time target", () => {
    const plan = buildTodayPlan([candidate()], { now: NOW, sessionBudgetMinutes: 30 });
    renderToday(plan);
    expect(screen.getByText(/Today's effort target/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/screen time/i);
  });
});

describe("criterion 13 — Teacher Today prioritises actionable evidence", () => {
  const inbox = buildAttentionInbox(
    [
      snapshot({
        learnerId: "quiet" as LearnerId,
        displayName: "Bilal R.",
        lastActiveAt: ago(30),
      }),
      snapshot({
        learnerId: "waiting" as LearnerId,
        displayName: "Amina S.",
        pendingVerifications: [
          { requestId: "r1", label: "Al-Mulk 12-15", requestedAt: ago(0.2) },
        ],
      }),
    ],
    { now: NOW },
  );

  const renderInbox = (onAct = vi.fn()) => {
    render(
      <LocaleProvider locale="en">
        <AttentionInbox inbox={inbox} onAct={onAct} />
      </LocaleProvider>,
    );
    return onAct;
  };

  it("puts waiting verifications first", () => {
    const { container } = render(
      <LocaleProvider locale="en">
        <AttentionInbox inbox={inbox} onAct={vi.fn()} />
      </LocaleProvider>,
    );
    const first = container.querySelector(".athar-attention__row");
    expect(first).toHaveAttribute("data-category", "awaiting_verification");
  });

  it("preserves the engine's category order in the DOM", () => {
    const { container } = render(
      <LocaleProvider locale="en">
        <AttentionInbox inbox={inbox} onAct={vi.fn()} />
      </LocaleProvider>,
    );
    const rank = new Map(ATTENTION_ORDER.map((c, i) => [c, i]));
    const order = [...container.querySelectorAll(".athar-attention__row")].map(
      (r) => rank.get(r.getAttribute("data-category") as never)!,
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("shows evidence, confidence, and one action on every row", () => {
    const { container } = render(
      <LocaleProvider locale="en">
        <AttentionInbox inbox={inbox} onAct={vi.fn()} />
      </LocaleProvider>,
    );
    for (const row of container.querySelectorAll(".athar-attention__row")) {
      expect(within(row as HTMLElement).getAllByRole("listitem").length).toBeGreaterThan(0);
      expect(row.querySelector(".athar-attention__confidence")?.textContent).toMatch(
        /Confidence: (high|medium|low)/,
      );
      expect(within(row as HTMLElement).getAllByRole("button")).toHaveLength(1);
    }
  });

  it("carries no chart, gauge, or decorative figure", () => {
    const { container } = render(
      <LocaleProvider locale="en">
        <AttentionInbox inbox={inbox} onAct={vi.fn()} />
      </LocaleProvider>,
    );
    expect(container.querySelectorAll("svg, canvas, figure")).toHaveLength(0);
  });

  it("acts on the row the teacher chose", async () => {
    const user = userEvent.setup();
    const onAct = renderInbox();
    await user.click(screen.getAllByRole("button", { name: "Verify" })[0]!);
    expect(onAct).toHaveBeenCalledWith(
      expect.objectContaining({ category: "awaiting_verification" }),
    );
  });

  it("shows an honest empty inbox rather than filler", () => {
    render(
      <LocaleProvider locale="en">
        <AttentionInbox
          inbox={buildAttentionInbox([snapshot()], { now: NOW })}
          onAct={vi.fn()}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText(/Nothing needs your attention/)).toBeInTheDocument();
  });
});

describe("the parent report explains rather than scores", () => {
  const renderReport = () =>
    render(
      <LocaleProvider locale="en">
        <ParentReport
          childName="Amina"
          weekSummary={[
            "Amina recalled Al-Mulk 8-11 on her own after seven days, but two joins still need support.",
          ]}
          quietDays={["Tuesday"]}
          teacherRequest={{
            text: "Ten minutes of listening before the next recitation.",
            teacherName: "Ustadh Kareem",
            date: "14 Aug",
          }}
          homeTasks={[
            {
              id: "h1",
              description: "Listening, 10 minutes",
              assignedByName: "Ustadh Kareem",
              checkedByName: "You",
              checkedOn: "15 Aug",
              done: true,
            },
          ]}
          lastVerification={{ date: "14 Aug", decision: "verified with a minor slip" }}
        />
      </LocaleProvider>,
    );

  it("shows no percentage anywhere", () => {
    renderReport();
    expect(document.body.textContent).not.toMatch(/%/);
  });

  it("names the quiet day rather than leaving a gap", () => {
    renderReport();
    expect(screen.getByText(/No recorded practice on Tuesday/)).toBeInTheDocument();
  });

  it("distinguishes who assigned a task from who checked it", () => {
    renderReport();
    expect(screen.getByText(/Assigned by Ustadh Kareem/)).toBeInTheDocument();
    expect(screen.getByText(/Checked by You on 15 Aug/)).toBeInTheDocument();
  });

  it("attributes the teacher's request to the teacher", () => {
    renderReport();
    expect(screen.getByText(/— Ustadh Kareem, 14 Aug/)).toBeInTheDocument();
  });

  it("says 'not reviewed' when no verification has happened", () => {
    render(
      <LocaleProvider locale="en">
        <ParentReport
          childName="Amina"
          weekSummary={[]}
          quietDays={[]}
          homeTasks={[]}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText("Not reviewed")).toBeInTheDocument();
  });
});
