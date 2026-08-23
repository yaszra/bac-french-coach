// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { h, renderSurface } from "../display/testing";
import { Field } from "./Field";
import { Input } from "./Input";
import { Select } from "./Select";
import { Textarea } from "./Textarea";
import inputStyles from "./Input.module.css";
import textareaStyles from "./Textarea.module.css";
import selectStyles from "./Select.module.css";

afterEach(cleanup);

describe("Input", () => {
  it("renders decorative prefix and suffix slots inside one frame", () => {
    const { container } = renderSurface(
      h(Input, { prefix: "Sūrah", suffix: "of 114", "aria-label": "Number" }),
    );
    const affixes = container.querySelectorAll(`.${inputStyles.affix}`);
    expect(affixes).toHaveLength(2);
    for (const affix of affixes) expect(affix.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows an invalid frame when told to, without a Field", () => {
    renderSurface(h(Input, { invalid: true, "aria-label": "Number" }));
    const input = screen.getByLabelText("Number");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.parentElement?.className).toContain(inputStyles.invalid);
  });

  it("grows a size step in the kids tier", () => {
    renderSurface(h(Input, { size: "md", "aria-label": "Number" }), { tier: "kids" });
    expect(screen.getByLabelText("Number").parentElement?.className).toContain(inputStyles.lg);
  });

  it("accepts typing", async () => {
    const user = userEvent.setup();
    renderSurface(h(Input, { "aria-label": "Number" }));
    await user.type(screen.getByLabelText("Number"), "18");
    expect((screen.getByLabelText("Number") as HTMLInputElement).value).toBe("18");
  });
});

describe("Textarea", () => {
  it("counts characters against maxLength", async () => {
    const user = userEvent.setup();
    const { container } = renderSurface(
      h(Textarea, { counter: true, maxLength: 20, "aria-label": "Note" }),
    );
    const counter = container.querySelector(`.${textareaStyles.counter}`);
    expect(counter?.getAttribute("aria-hidden")).toBe("true");
    expect(counter?.textContent).toBe("0 / 20");

    await user.type(screen.getByLabelText("Note"), "Salām");
    expect(container.querySelector(`.${textareaStyles.counter}`)?.textContent).toBe("5 / 20");
  });

  it("shows no counter without a maxLength to count against", () => {
    const { container } = renderSurface(h(Textarea, { counter: true, "aria-label": "Note" }));
    expect(container.querySelector(`.${textareaStyles.counter}`)).toBeNull();
  });

  it("takes its wiring from a Field", () => {
    renderSurface(h(Field, { label: "Note", error: "Too long" }, h(Textarea, null)));
    const field = screen.getByLabelText("Note");
    expect(field.tagName).toBe("TEXTAREA");
    expect(field.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("Select", () => {
  it("renders a native select with a decorative chevron", () => {
    const { container } = renderSurface(
      h(
        Select,
        { "aria-label": "Reciter" },
        h("option", { value: "husary" }, "Al-Ḥuṣarī"),
        h("option", { value: "minshawi" }, "Al-Minshāwī"),
      ),
    );
    const select = screen.getByLabelText("Reciter");
    expect(select.tagName).toBe("SELECT");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(container.querySelector(`.${selectStyles.chevron}`)?.getAttribute("aria-hidden")).toBe("true");
  });

  it("changes value", async () => {
    const user = userEvent.setup();
    renderSurface(
      h(
        Select,
        { "aria-label": "Reciter", defaultValue: "husary" },
        h("option", { value: "husary" }, "Al-Ḥuṣarī"),
        h("option", { value: "minshawi" }, "Al-Minshāwī"),
      ),
    );
    await user.selectOptions(screen.getByLabelText("Reciter"), "minshawi");
    expect((screen.getByLabelText("Reciter") as HTMLSelectElement).value).toBe("minshawi");
  });
});
