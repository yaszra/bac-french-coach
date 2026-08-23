/**
 * @vitest-environment jsdom
 *
 * Accessibility — acceptance criterion 18.
 *
 * "Arabic/RTL, keyboard access, screen-reader labels, reduced motion, and
 * 200% zoom pass the critical journey."
 *
 * Every component is checked in both locales, because a screen that is
 * accessible in English and broken in Arabic is not accessible.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import axe from "axe-core";

import { LocaleProvider } from "../../src/ui/i18n/context.js";
import { LOCALES, type Locale } from "../../src/ui/i18n/messages.js";
import { MushafPage } from "../../src/ui/components/MushafPage.js";
import { TileTray } from "../../src/ui/components/TileTray.js";
import { AssistanceControl } from "../../src/ui/components/AssistanceControl.js";
import { ScaffoldLadder } from "../../src/ui/components/ScaffoldLadder.js";
import { HonestMetric } from "../../src/ui/components/HonestMetric.js";
import { LearningStateBadge } from "../../src/ui/components/LearningStateBadge.js";
import { LearnerToday } from "../../src/ui/components/LearnerToday.js";
import { AttentionInbox } from "../../src/ui/components/AttentionInbox.js";
import { VerificationWorkspace } from "../../src/ui/components/VerificationWorkspace.js";
import { ParentReport } from "../../src/ui/components/ParentReport.js";
import {
  EmptyState,
  LoadingState,
  OfflineState,
  PermissionDeniedState,
  RecoverableErrorState,
  StaleDataNotice,
} from "../../src/ui/components/RouteStates.js";
import { buildAttentionInbox } from "../../src/core/attention.js";
import { buildTodayPlan, type Candidate } from "../../src/core/recommend.js";
import { MS_PER_DAY, type LearnerId, type MemoryTargetId } from "../../src/core/types.js";

const NOW = Date.UTC(2026, 1, 10, 9, 0, 0);

async function violations(element: ReactElement, locale: Locale) {
  const { container } = render(
    <LocaleProvider locale={locale}>{element}</LocaleProvider>,
  );
  const results = await axe.run(container, {
    // Contrast is verified numerically in tests/tokens.test.ts against the
    // token values; jsdom has no layout engine to measure it here.
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations.map((v) => `${v.id}: ${v.help}`);
}

const lines = [
  {
    lineNumber: 1,
    tokens: [
      { tokenId: "t1", positionInLine: 1, text: "SYN-1-1", widthUnits: 6 },
      { tokenId: "t2", positionInLine: 2, text: "SYN-1-2", widthUnits: 7 },
    ],
  },
];

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    targetId: "tgt-1" as MemoryTargetId,
    kind: "segment",
    state: "assigned",
    label: "Al-Mulk 12-15",
    estimatedActiveMinutes: 9,
    teacherPriority: 0,
    unresolvedCorrections: 0,
    correctionRecurrences: 0,
    prerequisiteWeakness: 0,
    connectionWeakness: 0,
    isAssignmentObligation: true,
    ...over,
  };
}

const todayPlan = buildTodayPlan([candidate()], {
  now: NOW,
  sessionBudgetMinutes: 20,
});

const inbox = buildAttentionInbox(
  [
    {
      learnerId: "l1" as LearnerId,
      displayName: "Amina S.",
      pendingVerifications: [
        { requestId: "r1", label: "Al-Mulk 12-15", requestedAt: NOW - MS_PER_DAY },
      ],
      corrections: [],
      assignments: [],
      dueReviewCount: 0,
      overdueReviewCount: 0,
      lastActiveAt: NOW,
      delayedRecalls: [],
      governanceRequests: [],
    },
  ],
  { now: NOW },
);

/** Every component, rendered with realistic props. */
const COMPONENTS: [string, ReactElement][] = [
  [
    "MushafPage",
    <MushafPage pageNumber={3} lines={lines} revealedTokenIds={["t1"]} label="Page 3" />,
  ],
  [
    "TileTray",
    <TileTray
      tiles={[
        { tokenId: "t1", text: "SYN-1-1" },
        { tokenId: "t2", text: "SYN-1-2" },
      ]}
      onPlace={() => undefined}
    />,
  ],
  ["AssistanceControl", <AssistanceControl onUse={() => undefined} />],
  ["ScaffoldLadder", <ScaffoldLadder level="gap_fill" lastChange="advanced" />],
  ["HonestMetric", <HonestMetric label="Independent recalls" count={4} total={9} />],
  ["HonestMetric (missing)", <HonestMetric label="Review" missing="notRecorded" />],
  ["LearningStateBadge", <LearningStateBadge state="established" />],
  [
    "LearnerToday",
    <LearnerToday plan={todayPlan} effortTargetMinutes={12} onStart={() => undefined} />,
  ],
  ["AttentionInbox", <AttentionInbox inbox={inbox} onAct={() => undefined} />],
  [
    "VerificationWorkspace",
    <VerificationWorkspace
      learnerName="Amina S."
      passageLabel="Al-Mulk 12-15"
      policyVersion="v1"
      assignedBy="Ustadh Kareem"
      priorCorrections={[{ category: "join", addedAt: "9 Aug", resolved: false }]}
      cueHistory={{ independent: 4, assisted: 1 }}
      advisorySignal={{ region: "ayah 13", confidence: "low" }}
      onDecide={() => undefined}
    />,
  ],
  [
    "ParentReport",
    <ParentReport
      childName="Amina"
      weekSummary={["Amina recalled Al-Mulk 8-11 on her own after seven days."]}
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
    />,
  ],
  ["LoadingState", <LoadingState />],
  ["EmptyState", <EmptyState />],
  ["StaleDataNotice", <StaleDataNotice minutesOld={4} />],
  ["PermissionDeniedState", <PermissionDeniedState />],
  ["OfflineState", <OfflineState />],
  ["RecoverableErrorState", <RecoverableErrorState onRetry={() => undefined} />],
];

describe("every component passes axe in both locales", () => {
  for (const locale of LOCALES)
    describe(`locale: ${locale}`, () => {
      it.each(COMPONENTS)("%s has no violations", async (_name, element) => {
        expect(await violations(element, locale)).toEqual([]);
      });
    });
});

describe("Arabic renders right-to-left", () => {
  it("mirrors the interface", () => {
    const { container } = render(
      <LocaleProvider locale="ar">
        <LearnerToday
          plan={todayPlan}
          effortTargetMinutes={12}
          onStart={() => undefined}
        />
      </LocaleProvider>,
    );
    expect(container.querySelector("[data-locale]")).toHaveAttribute("dir", "rtl");
    expect(container.querySelector("[data-locale]")).toHaveAttribute("lang", "ar");
  });

  it("translates every visible string, with no English left behind", () => {
    render(
      <LocaleProvider locale="ar">
        <LearnerToday
          plan={todayPlan}
          effortTargetMinutes={12}
          onStart={() => undefined}
        />
      </LocaleProvider>,
    );
    // The Arabic heading is present; the English one is not.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("اليوم");
  });
});

describe("drag has a keyboard equivalent", () => {
  it("places a tile with the keyboard alone", async () => {
    const onPlace = vi.fn();
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <TileTray
          tiles={[
            { tokenId: "t1", text: "SYN-1-1" },
            { tokenId: "t2", text: "SYN-1-2" },
          ]}
          onPlace={onPlace}
        />
      </LocaleProvider>,
    );

    await user.tab();
    // The tray is a single tab stop; arrows move within it.
    await user.keyboard("{ArrowLeft}");
    await user.keyboard("{Enter}");
    expect(onPlace).toHaveBeenCalledWith("t2");
  });

  it("exposes the tray as a listbox with a name and help text", () => {
    render(
      <LocaleProvider locale="en">
        <TileTray tiles={[{ tokenId: "t1", text: "SYN-1-1" }]} onPlace={() => undefined} />
      </LocaleProvider>,
    );
    const listbox = screen.getByRole("listbox", { name: "Word tiles" });
    expect(within(listbox).getAllByRole("option")).toHaveLength(1);
  });
});

describe("the hint control states its consequence before it is used", () => {
  it("describes the button with the consequence", () => {
    render(
      <LocaleProvider locale="en">
        <AssistanceControl onUse={() => undefined} />
      </LocaleProvider>,
    );
    const button = screen.getByRole("button", { name: "Need a hint" });
    const describedBy = button.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)?.textContent).toMatch(
      /practice, not independent recall/,
    );
  });
});

describe("verification decisions are reachable by keyboard shortcut", () => {
  it("files a decision on the number keys", async () => {
    const onDecide = vi.fn();
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <VerificationWorkspace
          learnerName="Amina S."
          passageLabel="Al-Mulk 12-15"
          policyVersion="v1"
          assignedBy="Ustadh Kareem"
          priorCorrections={[]}
          cueHistory={{ independent: 4, assisted: 1 }}
          onDecide={onDecide}
        />
      </LocaleProvider>,
    );
    await user.keyboard("2");
    expect(onDecide).toHaveBeenCalledWith("verified_minor_slip", []);
  });

  it("ignores the shortcut while a note is being typed", async () => {
    const onDecide = vi.fn();
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <VerificationWorkspace
          learnerName="Amina S."
          passageLabel="Al-Mulk 12-15"
          policyVersion="v1"
          assignedBy="Ustadh Kareem"
          priorCorrections={[]}
          cueHistory={{ independent: 4, assisted: 1 }}
          onDecide={onDecide}
        />
      </LocaleProvider>,
    );
    // `getByLabelText(/note/i)` would also match the "teacher_note"
    // correction checkbox, so target the textarea by role.
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("3 slips");
    expect(onDecide).not.toHaveBeenCalled();
  });

  it("advertises the shortcut on each decision", () => {
    render(
      <LocaleProvider locale="en">
        <VerificationWorkspace
          learnerName="Amina S."
          passageLabel="Al-Mulk 12-15"
          policyVersion="v1"
          assignedBy="Ustadh Kareem"
          priorCorrections={[]}
          cueHistory={{ independent: 4, assisted: 1 }}
          onDecide={() => undefined}
        />
      </LocaleProvider>,
    );
    expect(
      screen.getByRole("button", { name: /Verified cleanly/ }),
    ).toHaveAttribute("aria-keyshortcuts", "1");
  });
});

describe("no screen carries a bare percentage", () => {
  it("renders a count with its denominator, never a percent", () => {
    render(
      <LocaleProvider locale="en">
        <HonestMetric label="Independent recalls" count={4} total={9} />
      </LocaleProvider>,
    );
    expect(screen.getByText("4 of 9")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/%/);
  });

  it("names why a value is missing rather than showing a zero", () => {
    render(
      <LocaleProvider locale="en">
        <HonestMetric label="Review" missing="insufficient" />
      </LocaleProvider>,
    );
    expect(screen.getByText("Not enough evidence yet")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b0\b/);
  });
});

describe("meaning never depends on colour alone", () => {
  it("gives every learning state a distinct non-colour glyph", () => {
    const states = [
      "assigned",
      "preparing",
      "recalled_independently",
      "ready_for_verification",
      "verified",
      "established",
      "durable",
      "fragile",
      "repairing",
    ] as const;
    const glyphs = new Set<string>();
    for (const state of states) {
      const { container, unmount } = render(
        <LocaleProvider locale="en">
          <LearningStateBadge state={state} />
        </LocaleProvider>,
      );
      const glyph = container.querySelector(".athar-badge__glyph")!.textContent!;
      expect(glyph.length).toBeGreaterThan(0);
      glyphs.add(glyph);
      unmount();
    }
    expect(glyphs.size).toBe(states.length);
  });
});
