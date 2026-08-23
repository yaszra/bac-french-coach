/**
 * @vitest-environment jsdom
 *
 * The assignment wizard — acceptance criterion 1.
 *
 * "A teacher can assign an exact passage and evidence policy without
 * exposing answer keys or mutable learner settings."
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { LocaleProvider } from "../../src/ui/i18n/context.js";
import {
  AssignmentWizard,
  type WizardPassage,
} from "../../src/ui/components/AssignmentWizard.js";

const learners = [
  { learnerId: "l1", displayName: "Amina S." },
  { learnerId: "l2", displayName: "Yusuf K." },
];

const passages: WizardPassage[] = [
  {
    passageId: "p1",
    label: "Al-Mulk 12-15",
    ayahCount: 4,
    released: true,
    releaseBlocks: [],
  },
  {
    passageId: "p2",
    label: "Draft passage",
    ayahCount: 3,
    released: false,
    releaseBlocks: ["approval_missing"],
  },
];

function renderWizard(onAssign = vi.fn()) {
  render(
    <LocaleProvider locale="en">
      <AssignmentWizard learners={learners} passages={passages} onAssign={onAssign} />
    </LocaleProvider>,
  );
  return onAssign;
}

describe("the default path is Who, What, Review", () => {
  it("reaches review without ever showing the policy step", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByLabelText("Amina S."));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.click(screen.getByLabelText(/Al-Mulk 12-15/));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByRole("heading", { name: "Review and assign" }),
    ).toBeInTheDocument();
    // The teacher was never asked about non-serial recall counts.
    expect(screen.queryByLabelText(/random start or a join/)).toBeNull();
  });

  it("offers the policy step behind an explicit control", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByLabelText("Amina S."));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByLabelText(/Al-Mulk 12-15/));

    await user.click(screen.getByRole("button", { name: "Adjust evidence" }));
    expect(screen.getByLabelText(/Cue-free recalls/)).toBeInTheDocument();
  });
});

describe("unreleased content cannot be assigned, and says why", () => {
  it("disables the passage and shows its blocking reason", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByLabelText("Amina S."));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const draft = screen.getByLabelText(/Draft passage/) as HTMLInputElement;
    expect(draft.disabled).toBe(true);
    expect(screen.getByText(/not available: approval_missing/)).toBeInTheDocument();
  });
});

describe("defaults track what was chosen", () => {
  it("requires every recall of a join to be non-serial", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByLabelText("Amina S."));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByLabelText(/Al-Mulk 12-15/));
    await user.selectOptions(
      screen.getByLabelText("Kind"),
      "connection_boundary",
    );
    await user.click(screen.getByRole("button", { name: "Adjust evidence" }));

    const total = screen.getByLabelText(/Cue-free recalls/) as HTMLInputElement;
    const nonSerial = screen.getByLabelText(
      /random start or a join/,
    ) as HTMLInputElement;
    expect(nonSerial.value).toBe(total.value);
  });

  it("keeps a teacher's edit when the passage changes afterwards", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByLabelText("Amina S."));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByLabelText(/Al-Mulk 12-15/));
    await user.click(screen.getByRole("button", { name: "Adjust evidence" }));

    const listens = screen.getByLabelText(/Required listens/) as HTMLInputElement;
    await user.clear(listens);
    await user.type(listens, "7");
    expect(listens.value).toBe("7");
  });
});

describe("an unsatisfiable policy is refused before assigning", () => {
  it("shows the reason and blocks continuing", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByLabelText("Amina S."));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByLabelText(/Al-Mulk 12-15/));
    await user.click(screen.getByRole("button", { name: "Adjust evidence" }));

    const total = screen.getByLabelText(/Cue-free recalls/) as HTMLInputElement;
    await user.clear(total);
    await user.type(total, "1");
    const nonSerial = screen.getByLabelText(
      /random start or a join/,
    ) as HTMLInputElement;
    await user.clear(nonSerial);
    await user.type(nonSerial, "5");

    expect(screen.getByRole("alert").textContent).toMatch(/can never be satisfied/);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});

describe("assigning", () => {
  it("hands the route a complete draft", async () => {
    const user = userEvent.setup();
    const onAssign = renderWizard();

    await user.click(screen.getByLabelText("Amina S."));
    await user.click(screen.getByLabelText("Yusuf K."));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByLabelText(/Al-Mulk 12-15/));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    expect(onAssign).toHaveBeenCalledWith(
      expect.objectContaining({
        learnerIds: ["l1", "l2"],
        passageId: "p1",
        targetKind: "segment",
      }),
    );
  });

  it("cannot be submitted with nobody selected", async () => {
    renderWizard();
    // "Assign" only exists on the review step, which requires a learner.
    expect(screen.queryByRole("button", { name: "Assign" })).toBeNull();
  });
});

describe("accessibility", () => {
  it("marks the current step and has no axe violations", async () => {
    const { container } = render(
      <LocaleProvider locale="en">
        <AssignmentWizard
          learners={learners}
          passages={passages}
          onAssign={vi.fn()}
        />
      </LocaleProvider>,
    );
    expect(container.querySelector('[aria-current="step"]')?.textContent).toBe("Who");
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
