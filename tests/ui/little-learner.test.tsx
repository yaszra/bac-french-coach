/**
 * @vitest-environment jsdom
 *
 * Little-learner mode.
 *
 * One behavioural system, three presentations — not three apps. This
 * screen is the most constrained presentation: one action, no settings,
 * and an explicit handoff to an adult.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { LocaleProvider } from "../../src/ui/i18n/context.js";
import { LittleLearnerToday } from "../../src/ui/components/LittleLearnerToday.js";
import { layoutTokens } from "../../src/config/brand.js";
import { rank, type Candidate } from "../../src/core/recommend.js";
import type { MemoryTargetId } from "../../src/core/types.js";

const NOW = Date.UTC(2026, 8, 1, 9, 0, 0);

const candidate: Candidate = {
  targetId: "t1" as MemoryTargetId,
  kind: "segment",
  state: "assigned",
  label: "An-Nas",
  estimatedActiveMinutes: 4,
  teacherPriority: 0,
  unresolvedCorrections: 0,
  correctionRecurrences: 0,
  prerequisiteWeakness: 0,
  connectionWeakness: 0,
  isAssignmentObligation: true,
};

const next = rank([candidate], NOW)[0]!;

/**
 * `exactOptionalPropertyTypes` distinguishes "absent" from "set to
 * undefined", so an override that omits `next` has to omit the key.
 */
type Overrides = Omit<Partial<Parameters<typeof LittleLearnerToday>[0]>, "next"> & {
  next?: Parameters<typeof LittleLearnerToday>[0]["next"] | null;
};

function renderLittle(over: Overrides = {}) {
  const { next: nextOverride, ...rest } = over;
  const nextProp =
    "next" in over ? (nextOverride ?? undefined) : next;
  const onStart = vi.fn();
  const onAskGrownUp = vi.fn();
  const rendered = render(
    <LocaleProvider locale="en">
      <LittleLearnerToday
        {...(nextProp ? { next: nextProp } : {})}
        revealedStars={3}
        totalStars={60}
        onStart={onStart}
        onAskGrownUp={onAskGrownUp}
        {...rest}
      />
    </LocaleProvider>,
  );
  return { ...rendered, onStart, onAskGrownUp };
}

describe("one action at a time", () => {
  it("offers exactly two controls: start, and ask a grown-up", () => {
    renderLittle();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("starts the one thing there is to do", async () => {
    const user = userEvent.setup();
    const { onStart } = renderLittle();
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(onStart).toHaveBeenCalledWith("t1");
  });

  it("shows a quiet day as a quiet day, with nothing to start", () => {
    renderLittle({ next: null });
    expect(screen.getByText(/quiet day, not a missed one/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });
});

describe("no settings are exposed to a child", () => {
  it("renders no inputs, selects, or sliders at all", () => {
    const { container } = renderLittle();
    expect(container.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });

  it("hands off to an adult rather than showing a form", async () => {
    const user = userEvent.setup();
    const { onAskGrownUp } = renderLittle();
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(onAskGrownUp).toHaveBeenCalledOnce();
  });
});

describe("the reward is private and shows its denominator", () => {
  it("states stars earned out of the total, never a rank", () => {
    renderLittle();
    expect(screen.getByText("3 of 60")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/rank|place|position|beat/i);
  });

  it("names no other learner anywhere", () => {
    renderLittle();
    expect(document.body.textContent).not.toMatch(/classmate|others|top \d/i);
  });

  it("carries no coins, hearts, energy, or countdown", () => {
    renderLittle();
    expect(document.body.textContent).not.toMatch(
      /coin|gem|heart|energy|lives|streak ends|expires/i,
    );
  });
});

describe("accessibility", () => {
  it("meets the minimum touch target for its primary control", () => {
    const { container } = renderLittle();
    // Enforced globally by the token stylesheet; asserted here so the
    // child-facing screen cannot quietly opt out.
    expect(layoutTokens.minTouchTargetPx).toBeGreaterThanOrEqual(44);
    expect(container.querySelector(".athar-little__start")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <LocaleProvider locale="en">
        <LittleLearnerToday
          next={next}
          revealedStars={3}
          totalStars={60}
          onStart={vi.fn()}
          onAskGrownUp={vi.fn()}
        />
      </LocaleProvider>,
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  it("works in Arabic", async () => {
    const { container } = render(
      <LocaleProvider locale="ar">
        <LittleLearnerToday
          next={next}
          revealedStars={3}
          totalStars={60}
          onStart={vi.fn()}
          onAskGrownUp={vi.fn()}
        />
      </LocaleProvider>,
    );
    expect(container.querySelector("[data-locale]")).toHaveAttribute("dir", "rtl");
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
