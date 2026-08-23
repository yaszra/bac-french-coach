// @vitest-environment jsdom
import { createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderSurface } from "../display/renderSurface";
import { Switch } from "./Switch";

afterEach(cleanup);

describe("Switch", () => {
  it("is a switch with an associated label", () => {
    renderSurface(h(Switch, { label: "Spoken prompts" }));
    const control = screen.getByRole("switch", { name: "Spoken prompts" });
    expect(control.getAttribute("aria-checked")).toBe("false");
  });

  it("toggles on click", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    renderSurface(h(Switch, { label: "Spoken prompts", onCheckedChange }));

    const control = screen.getByRole("switch");
    await user.click(control);
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("toggles on Space", async () => {
    const user = userEvent.setup();
    renderSurface(h(Switch, { label: "Spoken prompts" }));

    const control = screen.getByRole("switch");
    control.focus();
    await user.keyboard(" ");
    expect(control.getAttribute("aria-checked")).toBe("true");
  });

  it("toggles on Enter", async () => {
    const user = userEvent.setup();
    renderSurface(h(Switch, { label: "Spoken prompts" }));

    const control = screen.getByRole("switch");
    control.focus();
    await user.keyboard("{Enter}");
    expect(control.getAttribute("aria-checked")).toBe("true");
  });

  it("honours a controlled value", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    renderSurface(h(Switch, { label: "Spoken prompts", checked: false, onCheckedChange }));

    const control = screen.getByRole("switch");
    await user.click(control);
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("does not toggle while disabled, and is not hidden from assistive tech", async () => {
    const user = userEvent.setup();
    renderSurface(h(Switch, { label: "Spoken prompts", disabled: true }));

    const control = screen.getByRole("switch", { name: "Spoken prompts" });
    expect(control.getAttribute("aria-hidden")).toBeNull();
    await user.click(control);
    expect(control.getAttribute("aria-checked")).toBe("false");
  });

  it("carries a mark as well as a colour", () => {
    const { container } = renderSurface(h(Switch, { label: "Spoken prompts", defaultChecked: true }));
    expect(container.querySelector("polyline")).not.toBeNull();
  });

  it("describes itself when given a description", () => {
    renderSurface(h(Switch, { label: "Spoken prompts", description: "Read the task aloud" }));
    const control = screen.getByRole("switch");
    const describedBy = control.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe("Read the task aloud");
  });
});
