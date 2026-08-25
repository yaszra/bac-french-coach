// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { translate } from "../../../platform/i18n/translate";
import { h, renderSurface } from "./testing";
import { Badge } from "./Badge";
import { EmptyState } from "./EmptyState";
import { Rosette } from "./Rosette";
import { Skeleton } from "./Skeleton";
import { Spinner } from "./Spinner";
import badgeStyles from "./Badge.module.css";
import rosetteStyles from "./Rosette.module.css";
import skeletonStyles from "./Skeleton.module.css";

afterEach(cleanup);

describe("Badge", () => {
  it("renders every tone", () => {
    for (const tone of ["neutral", "accent", "success", "caution", "danger"] as const) {
      renderSurface(h(Badge, { tone }, "Due"));
      expect(screen.getByText("Due").className).toContain(badgeStyles[tone]);
      cleanup();
    }
  });

  it("can carry a non-colour dot", () => {
    const { container } = renderSurface(h(Badge, { tone: "success", dot: true }, "Held"));
    expect(container.querySelector(`.${badgeStyles.dot}`)?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Spinner", () => {
  it("announces itself once, with a translated label", () => {
    renderSurface(h(Spinner, null));
    expect(screen.getByRole("status").textContent).toBe(translate("en", "a11y.loading"));
  });

  it("says nothing when the host control already reports busy", () => {
    const { container } = renderSurface(h(Spinner, { decorative: true }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive technology — the caller owns the live region", () => {
    const { container } = renderSurface(h(Skeleton, { variant: "block" }));
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders one node per text line, with a short last line", () => {
    const { container } = renderSurface(h(Skeleton, { variant: "text", lines: 3 }));
    expect(container.querySelectorAll(`.${skeletonStyles.text}`)).toHaveLength(3);
    expect(container.querySelectorAll(`.${skeletonStyles.lastLine}`)).toHaveLength(1);
  });
});

describe("Rosette", () => {
  it("is a meter, like Progress", () => {
    renderSurface(h(Rosette, { value: 5, max: 20, label: "Juzʾ 30" }));
    const meter = screen.getByRole("progressbar", { name: "Juzʾ 30" });
    expect(meter.getAttribute("aria-valuenow")).toBe("5");
    expect(meter.getAttribute("aria-valuemax")).toBe("20");
    expect(meter.getAttribute("aria-valuetext")).toBe(
      translate("en", "progress.ofReviewed", { done: 5, total: 20 }),
    );
  });

  it("draws eight radial notches, as the muṣḥaf rosette does", () => {
    const { container } = renderSurface(h(Rosette, { value: 0, label: "Juzʾ 30" }));
    expect(container.querySelectorAll("line")).toHaveLength(8);
  });

  it("lights notches as the arc passes them, so progress survives greyscale", () => {
    const { container } = renderSurface(h(Rosette, { value: 50, max: 100, label: "Juzʾ 30" }));
    expect(container.querySelectorAll(`.${rosetteStyles.notchEarned}`)).toHaveLength(4);
  });

  it("turns gold only for a milestone", () => {
    const { container } = renderSurface(h(Rosette, { value: 100, milestone: true, label: "Done" }));
    expect(container.firstElementChild?.className).toContain(rosetteStyles.milestone);
    cleanup();

    const plain = renderSurface(h(Rosette, { value: 100, label: "Done" }));
    expect(plain.container.firstElementChild?.className).not.toContain(rosetteStyles.milestone);
  });
});

describe("EmptyState", () => {
  it("falls back to the honest empty string", () => {
    renderSurface(h(EmptyState, null));
    expect(screen.getByRole("heading").textContent).toBe(translate("en", "state.empty"));
  });

  it("says not-yet-recorded rather than nothing at all", () => {
    renderSurface(h(EmptyState, { variant: "not-yet-recorded" }));
    expect(screen.getByRole("heading").textContent).toBe(translate("en", "state.notYetRecorded"));
  });

  it("takes a caller title, description and exactly one action", () => {
    renderSurface(
      h(EmptyState, {
        title: "No reviews due",
        description: "Come back tomorrow",
        action: h("a", { href: "/today" }, "Today"),
        headingLevel: 2,
      }),
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("No reviews due");
    expect(screen.getByText("Come back tomorrow")).toBeDefined();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
