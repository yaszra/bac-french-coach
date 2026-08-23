/**
 * @vitest-environment jsdom
 *
 * The memorization workspace — layout and blank-page rules from docs/03.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocaleProvider } from "../../src/ui/i18n/context.js";
import {
  MemorizationSession,
  SESSION_STAGES,
  type MemorizationSessionProps,
} from "../../src/ui/components/MemorizationSession.js";

const lines = [
  {
    lineNumber: 1,
    tokens: [
      { tokenId: "t1", positionInLine: 1, text: "SYN-1-1", widthUnits: 6 },
      { tokenId: "t2", positionInLine: 2, text: "SYN-1-2", widthUnits: 7 },
    ],
  },
];

function renderSession(over: Partial<MemorizationSessionProps> = {}) {
  const props: MemorizationSessionProps = {
    stage: "reconstruct",
    pageNumber: 3,
    lines,
    revealedTokenIds: [],
    passageLabel: "Al-Mulk 12-15",
    scaffoldLevel: "full_tiles",
    listens: { done: 2, required: 3 },
    tiles: [
      { tokenId: "t1", text: "SYN-1-1" },
      { tokenId: "t2", text: "SYN-1-2" },
    ],
    assistanceUsed: false,
    onListen: vi.fn(),
    onPlaceTile: vi.fn(),
    onUseHint: vi.fn(),
    ...over,
  };
  return render(
    <LocaleProvider locale="en">
      <MemorizationSession {...props} />
    </LocaleProvider>,
  );
}

describe("the tray sits below the page, never over it", () => {
  it("renders the tray after the muṣḥaf in reading order", () => {
    const { container } = renderSession();
    const page = container.querySelector(".athar-mushaf")!;
    const tray = container.querySelector(".athar-tray")!;
    // DOCUMENT_POSITION_FOLLOWING: the tray comes after the page.
    expect(page.compareDocumentPosition(tray) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("never nests the tray inside the muṣḥaf", () => {
    const { container } = renderSession();
    expect(container.querySelector(".athar-mushaf .athar-tray")).toBeNull();
  });

  it("puts nothing inside the muṣḥaf but its own lines", () => {
    const { container } = renderSession();
    const page = container.querySelector(".athar-mushaf")!;
    const foreign = [...page.querySelectorAll("*")].filter(
      (el) => !el.className.toString().startsWith("athar-mushaf") &&
              !el.className.toString().startsWith("athar-visually-hidden"),
    );
    expect(foreign).toEqual([]);
  });
});

describe("the session begins blank and says so", () => {
  it("shows the blank-page explanation when nothing is revealed", () => {
    renderSession({ revealedTokenIds: [] });
    expect(
      screen.getByText(/page begins blank. Words appear as you recall them/),
    ).toBeInTheDocument();
  });

  it("renders no words on a blank page", () => {
    const { container } = renderSession({ revealedTokenIds: [] });
    expect(container.querySelectorAll(".athar-mushaf__word")).toHaveLength(0);
  });
});

describe("only the current stage is shown", () => {
  it("names the current stage and its position in the loop", () => {
    renderSession({ stage: "prove" });
    const index = SESSION_STAGES.indexOf("prove") + 1;
    expect(
      screen.getByText(`Stage ${index} of ${SESSION_STAGES.length}`),
    ).toBeInTheDocument();
    expect(screen.getByText("Prove independent recall")).toBeInTheDocument();
  });

  it("does not offer tiles once the learner is past the scaffolded rungs", () => {
    const { container } = renderSession({
      stage: "prove",
      scaffoldLevel: "oral_blank_page",
    });
    expect(container.querySelector(".athar-tray")).toBeNull();
  });
});

describe("server-counted listens are shown against the policy", () => {
  it("shows progress toward the required count", () => {
    renderSession({ listens: { done: 2, required: 3 } });
    expect(screen.getByText("Listens: 2 of 3")).toBeInTheDocument();
  });
});

describe("the session exposes no assignment settings to the learner", () => {
  it("offers no controls that could change the evidence policy", () => {
    const { container } = renderSession();
    const controls = [...container.querySelectorAll("input, select")];
    // The only inputs on this screen are none: unit size, listens, cue
    // policy, verification policy, and due date are adult-set elsewhere.
    expect(controls).toEqual([]);
  });
});
