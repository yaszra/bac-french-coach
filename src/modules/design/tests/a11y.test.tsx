// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { SurfaceProvider } from "../theme/ThemeProvider";
import type { Locale } from "../../platform/i18n/types";
import { MushafPage, type MushafLine } from "../ui/mushaf";
import { Tile, ToastRegion, useToasts } from "../ui/feedback";
import { Dialog, Tooltip } from "../ui/overlays";

/**
 * Accessibility is a behaviour, not an attribute. These tests drive the
 * components the way a keyboard and a screen reader do.
 */

afterEach(cleanup);

function Surface({
  children,
  locale = "en",
}: {
  readonly children: ReactNode;
  readonly locale?: Locale;
}) {
  return (
    <SurfaceProvider theme="light" tier="adult" locale={locale}>
      {children}
    </SurfaceProvider>
  );
}

describe("Dialog", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          open
        </button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="dialog-title"
          footer={
            <button type="button" id="confirm">
              confirm
            </button>
          }
        />
      </>
    );
  }

  it("is a labelled modal that traps focus and gives it back", async () => {
    const user = userEvent.setup();
    render(
      <Surface>
        <Harness />
      </Surface>,
    );

    const trigger = screen.getByRole("button", { name: "open" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("dialog", { name: "dialog-title" })).toBe(dialog);

    /* Focus went in… */
    expect(dialog.contains(document.activeElement)).toBe(true);

    /* …and cannot get out: tabbing past the last control returns to the first. */
    const first = document.activeElement;
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(first);

    /* Escape closes, and the trigger gets its focus back. */
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("MushafPage", () => {
  const lines: readonly MushafLine[] = [
    {
      id: "line-1",
      words: [
        { text: "1", depth: 5, ayah: 1, index: 1 },
        { text: "2", depth: 5, ayah: 1, index: 2 },
        { text: "3", depth: 5, ayah: 1, index: 3, endsAyah: true },
      ],
    },
    {
      id: "line-2",
      words: [
        { text: "4", depth: 0, ayah: 2, index: 1 },
        { text: "5", depth: 5, ayah: 2, index: 2, endsAyah: true },
      ],
    },
  ];

  function words() {
    return screen.getAllByRole("button");
  }

  it("keeps one tab stop for the whole page and moves by word", () => {
    render(
      <Surface>
        <MushafPage lines={lines} />
      </Surface>,
    );

    const buttons = words();
    expect(buttons).toHaveLength(5);
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    expect(buttons[0]?.tabIndex).toBe(0);

    /* The page is right-to-left: leftwards is forwards. */
    fireEvent.keyDown(buttons[0] as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(buttons[1]);
    expect(words().filter((button) => button.tabIndex === 0)).toHaveLength(1);
    expect(words()[1]?.tabIndex).toBe(0);

    fireEvent.keyDown(buttons[1] as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[0]);

    /* Down a line, keeping the column. */
    fireEvent.keyDown(buttons[0] as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[3]);

    /* Home and End work on the line; Ctrl reaches the page. */
    fireEvent.keyDown(buttons[3] as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(buttons[4]);
    fireEvent.keyDown(buttons[4] as HTMLElement, { key: "Home", ctrlKey: true });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("announces a hidden word instead of dropping it", () => {
    render(
      <Surface>
        <MushafPage lines={lines} />
      </Surface>,
    );
    /* Depth 0 keeps its place and says what it is. */
    expect(screen.getByRole("button", { name: "Word 1 of āyah 2" })).toBeDefined();
  });

  it("says so when there is no page", () => {
    render(
      <Surface>
        <MushafPage lines={[]} />
      </Surface>,
    );
    expect(screen.getByText("Not yet recorded")).toBeDefined();
  });
});

describe("Tile", () => {
  it("picks up, moves and puts down from the keyboard, narrating each step", () => {
    const onMove = vi.fn();
    const { container } = render(
      <Surface>
        <Tile text="1" lang="en" slot={3} ayah={5} onMove={onMove} />
      </Surface>,
    );

    const tile = screen.getByRole("button");
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(tile.getAttribute("aria-pressed")).toBe("false");

    fireEvent.keyDown(tile, { key: "Enter" });
    expect(tile.getAttribute("aria-pressed")).toBe("true");
    expect(live?.textContent).toBe("Word 3 of āyah 5");

    /* Left-to-right surface: rightwards is forwards. */
    fireEvent.keyDown(tile, { key: "ArrowRight" });
    expect(onMove).toHaveBeenCalledWith("forward");
    fireEvent.keyDown(tile, { key: "ArrowLeft" });
    expect(onMove).toHaveBeenLastCalledWith("backward");

    fireEvent.keyDown(tile, { key: "Escape" });
    expect(tile.getAttribute("aria-pressed")).toBe("false");
  });

  it("follows the reading direction in Arabic", () => {
    const onMove = vi.fn();
    render(
      <Surface locale="ar">
        <Tile text="1" lang="en" slot={1} ayah={1} onMove={onMove} />
      </Surface>,
    );

    const tile = screen.getByRole("button");
    fireEvent.keyDown(tile, { key: "Enter" });
    fireEvent.keyDown(tile, { key: "ArrowLeft" });
    expect(onMove).toHaveBeenCalledWith("forward");
  });
});

describe("Tooltip", () => {
  it("opens on focus, not only on hover, and describes its trigger", async () => {
    const user = userEvent.setup();
    render(
      <Surface>
        <Tooltip content="hint">
          <button type="button">trigger</button>
        </Tooltip>
      </Surface>,
    );

    const trigger = screen.getByRole("button", { name: "trigger" });
    expect(screen.queryByRole("tooltip")).toBeNull();

    await user.tab();
    expect(document.activeElement).toBe(trigger);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe("hint");
    expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);

    await user.tab();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("ToastRegion", () => {
  function Harness() {
    const { push } = useToasts();
    return (
      <button type="button" onClick={() => push({ messageKey: "state.pendingSync" })}>
        push
      </button>
    );
  }

  it("is a polite live region that exists before anything is announced", async () => {
    const user = userEvent.setup();
    render(
      <Surface>
        <ToastRegion>
          <Harness />
        </ToastRegion>
      </Surface>,
    );

    const region = document.body.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region?.textContent).toBe("");

    await user.click(screen.getByRole("button", { name: "push" }));
    expect(region?.textContent).toContain("Waiting to sync");
  });

  it("never stacks more than three", async () => {
    const user = userEvent.setup();
    render(
      <Surface>
        <ToastRegion>
          <Harness />
        </ToastRegion>
      </Surface>,
    );

    const push = screen.getByRole("button", { name: "push" });
    for (let index = 0; index < 4; index += 1) await user.click(push);

    expect(screen.getAllByText("Waiting to sync")).toHaveLength(3);
  });
});
