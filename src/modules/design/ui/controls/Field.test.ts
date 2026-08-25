// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { h, renderSurface } from "../display/testing";
import { Field, type FieldControlProps } from "./Field";
import { Input } from "./Input";

afterEach(cleanup);

describe("Field", () => {
  it("ties the label to the control it wraps", () => {
    renderSurface(h(Field, { label: "Sūrah" }, h(Input, null)));
    const input = screen.getByLabelText("Sūrah");
    expect(input.tagName).toBe("INPUT");
    expect(input.id).not.toBe("");
  });

  it("hands the wiring to a render prop", () => {
    let seen: FieldControlProps | null = null;
    renderSurface(
      h(Field, {
        label: "Āyah",
        description: "From 1",
        error: "Out of range",
        required: true,
        children: (control) => {
          seen = control;
          return h("input", { ...control });
        },
      }),
    );

    const control = seen as FieldControlProps | null;
    expect(control).not.toBeNull();
    expect(control?.["aria-invalid"]).toBe(true);
    expect(control?.required).toBe(true);
    expect(control?.["aria-describedby"]?.split(" ")).toHaveLength(2);
  });

  it("wires description and error into aria-describedby, in that order", () => {
    renderSurface(
      h(Field, { label: "Sūrah", description: "Pick one", error: "Required" }, h(Input, null)),
    );

    const input = screen.getByLabelText("Sūrah");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0] ?? "")?.textContent).toBe("Pick one");
    expect(document.getElementById(ids[1] ?? "")?.textContent).toBe("Required");
  });

  it("marks the control invalid only when there is an error", () => {
    renderSurface(h(Field, { label: "Sūrah" }, h(Input, null)));
    expect(screen.getByLabelText("Sūrah").getAttribute("aria-invalid")).toBeNull();
    cleanup();

    renderSurface(h(Field, { label: "Sūrah", error: "Required" }, h(Input, null)));
    expect(screen.getByLabelText("Sūrah").getAttribute("aria-invalid")).toBe("true");
  });

  it("announces errors politely rather than shouting them", () => {
    const { container } = renderSurface(
      h(Field, { label: "Sūrah", error: "Required" }, h(Input, null)),
    );
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("Required");
  });

  it("marks required on the control and keeps the asterisk decorative", () => {
    const { container } = renderSurface(h(Field, { label: "Sūrah", required: true }, h(Input, null)));
    expect(screen.getByLabelText("Sūrah").hasAttribute("required")).toBe(true);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("*");
  });

  it("keeps a hidden label in the accessibility tree", () => {
    renderSurface(h(Field, { label: "Search", hideLabel: true }, h(Input, null)));
    expect(screen.getByLabelText("Search")).toBeDefined();
  });
});
