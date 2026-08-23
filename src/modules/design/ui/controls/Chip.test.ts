// @vitest-environment jsdom
import { createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderSurface } from "../display/renderSurface";
import { Chip } from "./Chip";
import styles from "./Chip.module.css";

afterEach(cleanup);

describe("Chip", () => {
  it("is a plain span when it does nothing", () => {
    renderSurface(h(Chip, null, "Juzʾ 30"));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Juzʾ 30").tagName).toBe("SPAN");
  });

  it("becomes a pressable filter when given a selected state", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderSurface(h(Chip, { selected: false, onClick }, "Due"));

    const chip = screen.getByRole("button", { name: "Due" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    await user.click(chip);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("marks selection with a tick as well as a fill", () => {
    const { container } = renderSurface(h(Chip, { selected: true }, "Due"));
    expect(screen.getByRole("button", { name: "Due" }).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("polyline")).not.toBeNull();
  });

  it("renders each tone", () => {
    for (const tone of ["neutral", "accent", "success", "caution", "danger"] as const) {
      renderSurface(h(Chip, { tone }, "Tone"));
      expect(screen.getByText("Tone").className).toContain(styles[tone]);
      cleanup();
    }
  });

  it("carries a labelled remove control that is a sibling, not a nested button", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    renderSurface(h(Chip, { onRemove, removeLabel: "Remove Al-Fātiḥah" }, "Al-Fātiḥah"));

    const remove = screen.getByRole("button", { name: "Remove Al-Fātiḥah" });
    expect(remove.querySelector("button")).toBeNull();
    await user.click(remove);
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("keeps the body and the remove control as two separate targets", () => {
    const onRemove = vi.fn();
    const onClick = vi.fn();
    renderSurface(
      h(Chip, { onRemove, removeLabel: "Remove Al-Fātiḥah", onClick }, "Al-Fātiḥah"),
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
