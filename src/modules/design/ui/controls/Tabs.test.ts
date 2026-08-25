// @vitest-environment jsdom
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { h, renderSurface, type SurfaceOptions } from "../display/testing";
import { Tab, TabList, TabPanel, Tabs, type TabsActivation } from "./Tabs";

afterEach(cleanup);

function build(options: { activation?: TabsActivation; onValueChange?: (value: string) => void } = {}): ReactElement {
  return h(
    Tabs,
    {
      defaultValue: "hifz",
      ...(options.activation === undefined ? {} : { activation: options.activation }),
      ...(options.onValueChange === undefined ? {} : { onValueChange: options.onValueChange }),
    },
    h(
      TabList,
      { "aria-label": "Sections" },
      h(Tab, { value: "hifz" }, "Ḥifẓ"),
      h(Tab, { value: "reading" }, "Reading"),
      h(Tab, { value: "practice" }, "Practice"),
    ),
    h(TabPanel, { value: "hifz" }, "Ḥifẓ panel"),
    h(TabPanel, { value: "reading" }, "Reading panel"),
    h(TabPanel, { value: "practice" }, "Practice panel"),
  );
}

function renderTabs(surface: SurfaceOptions = {}, options: Parameters<typeof build>[0] = {}) {
  return renderSurface(build(options), surface);
}

const tabNames = ["Ḥifẓ", "Reading", "Practice"] as const;
const tabAt = (index: number) => screen.getByRole("tab", { name: tabNames[index] ?? "" });

describe("Tabs", () => {
  it("wires roles, ids and the panel relationship", () => {
    renderTabs();
    const list = screen.getByRole("tablist", { name: "Sections" });
    expect(list).toBeDefined();

    const selected = screen.getByRole("tab", { selected: true });
    const panel = screen.getByRole("tabpanel");
    expect(selected.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(selected.id);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("uses a roving tabindex", () => {
    renderTabs();
    expect(tabAt(0).getAttribute("tabindex")).toBe("0");
    expect(tabAt(1).getAttribute("tabindex")).toBe("-1");
    expect(tabAt(2).getAttribute("tabindex")).toBe("-1");
  });

  it("moves forward with ArrowRight and wraps backwards with ArrowLeft in LTR", async () => {
    const user = userEvent.setup();
    renderTabs();

    tabAt(0).focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tabAt(1));
    expect(tabAt(1).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Reading panel");

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(tabAt(0));

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(tabAt(2));
  });

  it("reverses the arrows in RTL", async () => {
    const user = userEvent.setup();
    renderTabs({ locale: "ar" });

    tabAt(0).focus();
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(tabAt(1));
    expect(tabAt(1).getAttribute("aria-selected")).toBe("true");

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tabAt(0));

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tabAt(2));
  });

  it("jumps to the ends with Home and End", async () => {
    const user = userEvent.setup();
    renderTabs();

    tabAt(0).focus();
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(tabAt(2));

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(tabAt(0));
  });

  it("moves focus without selecting under manual activation", async () => {
    const user = userEvent.setup();
    renderTabs({}, { activation: "manual" });

    tabAt(0).focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tabAt(1));
    expect(tabAt(1).getAttribute("aria-selected")).toBe("false");

    await user.keyboard("{Enter}");
    expect(tabAt(1).getAttribute("aria-selected")).toBe("true");
  });

  it("reports every change to a controlled owner", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderTabs({}, { onValueChange });

    await user.click(tabAt(2));
    expect(onValueChange).toHaveBeenCalledWith("practice");
  });

  it("shows only the selected panel", () => {
    renderTabs();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.queryByText("Reading panel")).toBeNull();
  });
});
