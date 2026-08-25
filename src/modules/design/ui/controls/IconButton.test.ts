// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { h, renderSurface } from "../display/testing";
import { IconButton } from "./IconButton";
import buttonStyles from "./Button.module.css";
import styles from "./IconButton.module.css";

afterEach(cleanup);

const GLYPH = h("svg", { viewBox: "0 0 12 12" });

describe("IconButton", () => {
  it("exposes its required label as the accessible name", () => {
    renderSurface(h(IconButton, { label: "Close dialogue", icon: GLYPH }));
    expect(screen.getByRole("button", { name: "Close dialogue" })).toBeDefined();
  });

  it("hides the glyph itself from assistive technology", () => {
    renderSurface(h(IconButton, { label: "Menu", icon: GLYPH }));
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button.querySelector(`.${styles.glyph}`)?.getAttribute("aria-hidden")).toBe("true");
  });

  it("is square and wears the shared button variant", () => {
    renderSurface(h(IconButton, { label: "Menu", icon: GLYPH, variant: "secondary" }));
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button.className).toContain(buttonStyles.root);
    expect(button.className).toContain(buttonStyles.secondary);
    expect(button.className).toContain(styles.sm);
  });

  it("grows a step in the kids tier", () => {
    renderSurface(h(IconButton, { label: "Menu", icon: GLYPH, size: "sm" }), { tier: "kids" });
    expect(screen.getByRole("button", { name: "Menu" }).className).toContain(styles.md);
  });

  it("cannot be activated while disabled or loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderSurface(h(IconButton, { label: "Menu", icon: GLYPH, loading: true, onClick }));

    const button = screen.getByRole("button", { name: "Menu" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
