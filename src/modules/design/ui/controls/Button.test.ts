// @vitest-environment jsdom
import { createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderSurface } from "../display/renderSurface";
import { Button, type ButtonVariant } from "./Button";
import styles from "./Button.module.css";

afterEach(cleanup);

const VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "quiet", "danger"];

describe("Button", () => {
  it("renders every variant with its own class and no other", () => {
    for (const variant of VARIANTS) {
      renderSurface(h(Button, { variant }, "Continue"));
      const button = screen.getByRole("button", { name: "Continue" });
      expect(button.className).toContain(styles.root);
      expect(button.className).toContain(styles[variant]);
      for (const other of VARIANTS.filter((v) => v !== variant)) {
        expect(button.className).not.toContain(styles[other]);
      }
      cleanup();
    }
  });

  it("defaults to type=button so it never submits a form by accident", () => {
    renderSurface(h(Button, null, "Save"));
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("bumps its size one step in the kids tier", () => {
    renderSurface(h(Button, { size: "md" }, "Start"), { tier: "kids" });
    expect(screen.getByRole("button").className).toContain(styles.lg);
    cleanup();

    renderSurface(h(Button, { size: "md" }, "Start"));
    expect(screen.getByRole("button").className).toContain(styles.md);
  });

  it("cannot be activated while disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderSurface(h(Button, { disabled: true, onClick }, "Save"));

    const button = screen.getByRole("button", { name: "Save" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is busy, not disabled, while loading: aria-busy, focusable, inert", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderSurface(h(Button, { loading: true, onClick }, "Save"));

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(false);

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps its label in the DOM while loading so the width never jumps", () => {
    renderSurface(h(Button, { loading: true }, "Save"));
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Save");
    expect(button.querySelector(`.${styles.busy}`)).not.toBeNull();
  });

  it("hides decorative icons from assistive technology", () => {
    renderSurface(h(Button, { iconStart: h("svg", { "data-testid": "glyph" }) }, "Listen"));
    const button = screen.getByRole("button", { name: "Listen" });
    const wrapper = button.querySelector(`.${styles.icon}`);
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });

  it("stretches only when asked", () => {
    renderSurface(h(Button, { fullWidth: true }, "Next"));
    expect(screen.getByRole("button").className).toContain(styles.fullWidth);
  });
});
