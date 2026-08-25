// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { translate } from "../../../platform/i18n/translate";
import { h, renderSurface } from "./testing";
import { Progress } from "./Progress";

afterEach(cleanup);

describe("Progress", () => {
  it("exposes the full ARIA meter", () => {
    renderSurface(h(Progress, { value: 12, max: 30, label: "Reviews" }));
    const meter = screen.getByRole("progressbar", { name: "Reviews" });
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBe("30");
    expect(meter.getAttribute("aria-valuenow")).toBe("12");
  });

  it("always renders the denominator beside a label, never a bare rate", () => {
    renderSurface(h(Progress, { value: 12, max: 30, label: "Reviews" }));
    const expected = translate("en", "progress.ofReviewed", { done: 12, total: 30 });
    expect(screen.getByText(expected)).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(expected);
  });

  it("carries the denominator in Arabic too", () => {
    renderSurface(h(Progress, { value: 3, max: 7, label: "المراجعات" }), { locale: "ar" });
    const expected = translate("ar", "progress.ofReviewed", { done: 3, total: 7 });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(expected);
  });

  it("clamps out-of-range values instead of reporting them", () => {
    renderSurface(h(Progress, { value: 99, max: 10, label: "Reviews" }));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("10");
  });

  it("renders the not-yet-recorded state rather than a fabricated 0%", () => {
    renderSurface(h(Progress, { unknown: true, label: "Reviews" }));
    expect(screen.getByText(translate("en", "state.notYetRecorded"))).toBeDefined();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("reports work in flight without inventing a value", () => {
    renderSurface(h(Progress, { indeterminate: true, label: "Syncing" }));
    const meter = screen.getByRole("progressbar", { name: "Syncing" });
    expect(meter.getAttribute("aria-busy")).toBe("true");
    expect(meter.getAttribute("aria-valuenow")).toBeNull();
  });
});
