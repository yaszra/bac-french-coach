// @vitest-environment jsdom
import { createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderSurface } from "../display/renderSurface";
import { LinkButton } from "./LinkButton";
import buttonStyles from "./Button.module.css";

afterEach(cleanup);

describe("LinkButton", () => {
  it("renders an anchor wearing the button clothes", () => {
    renderSurface(h(LinkButton, { href: "/quran" }, "Qurʾān"));
    const link = screen.getByRole("link", { name: "Qurʾān" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/quran");
    expect(link.className).toContain(buttonStyles.root);
  });

  it("adds the safe rel and target for external links", () => {
    renderSurface(h(LinkButton, { href: "https://example.org", external: true }, "Source"));
    const link = screen.getByRole("link", { name: "Source" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("announces disabled and refuses to navigate, but stays focusable", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderSurface(h(LinkButton, { href: "/quran", disabled: true, onClick }, "Qurʾān"));

    const link = screen.getByRole("link", { name: "Qurʾān" });
    expect(link.getAttribute("aria-disabled")).toBe("true");
    await user.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("can render through a router-aware component", () => {
    const Anchor = (props: Record<string, unknown>) => h("a", { ...props, "data-router": "true" });
    renderSurface(h(LinkButton, { href: "/today", as: Anchor }, "Today"));
    expect(screen.getByRole("link", { name: "Today" }).getAttribute("data-router")).toBe("true");
  });
});
