// @vitest-environment jsdom
/**
 * The design law, asserted.
 *
 * jsdom has no layout engine, so a tap target cannot be measured here. What can
 * be proven is the contract that produces it: the token says 44px (56px for
 * children), the rule spends that token, and the rendered element wears that
 * rule. All three are checked below.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { h, renderSurface } from "../display/testing";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { IconButton } from "./IconButton";
import { Input } from "./Input";
import { Switch } from "./Switch";
import { Tab, TabList, Tabs } from "./Tabs";
import buttonStyles from "./Button.module.css";
import chipStyles from "./Chip.module.css";
import iconButtonStyles from "./IconButton.module.css";
import inputStyles from "./Input.module.css";
import switchStyles from "./Switch.module.css";
import tabsStyles from "./Tabs.module.css";

afterEach(cleanup);

const DESIGN_DIR = path.resolve(process.cwd(), "src/modules/design");
const UI_DIR = path.join(DESIGN_DIR, "ui");
const TOKENS = readFileSync(path.join(DESIGN_DIR, "tokens", "marginalia.css"), "utf8");

const OWNED_STYLESHEETS = [
  "controls/Button.module.css",
  "controls/Chip.module.css",
  "controls/Field.module.css",
  "controls/IconButton.module.css",
  "controls/Input.module.css",
  "controls/LinkButton.module.css",
  "controls/Select.module.css",
  "controls/Switch.module.css",
  "controls/Tabs.module.css",
  "controls/Textarea.module.css",
  "display/Badge.module.css",
  "display/EmptyState.module.css",
  "display/Progress.module.css",
  "display/Rosette.module.css",
  "display/Skeleton.module.css",
  "display/Spinner.module.css",
  "display/Table.module.css",
  "display/shared.module.css",
] as const;

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const read = (relative: string): string => stripComments(readFileSync(path.join(UI_DIR, relative), "utf8"));

function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (match === null) throw new Error(`no rule for ${selector}`);
  return match[1] ?? "";
}

describe("token discipline", () => {
  it("spends no colour that is not a token", () => {
    for (const sheet of OWNED_STYLESHEETS) {
      const css = read(sheet);
      expect(css, sheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css, sheet).not.toMatch(/\b(?:rgba?|hsla?)\(/);
    }
  });

  it("uses no raw length beyond a hairline — every size comes from a token", () => {
    for (const sheet of OWNED_STYLESHEETS) {
      const lengths = read(sheet).match(/-?\d+(?:\.\d+)?px/g) ?? [];
      for (const length of lengths) {
        expect(Math.abs(Number.parseFloat(length)), `${sheet} → ${length}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it("uses no physical direction — RTL is a first-class reading direction", () => {
    for (const sheet of OWNED_STYLESHEETS) {
      const css = read(sheet);
      expect(css, sheet).not.toMatch(/(?:^|[\s;{])(?:left|right|float)\s*:/m);
      expect(css, sheet).not.toMatch(/(?:margin|padding|border|inset)-(?:left|right)\s*:/);
      expect(css, sheet).not.toMatch(/text-align\s*:\s*(?:left|right)/);
    }
  });

  it("never shouts !important at another rule", () => {
    for (const sheet of OWNED_STYLESHEETS) {
      expect(read(sheet), sheet).not.toContain("!important");
    }
  });

  it("declares motion only through the motion tokens", () => {
    for (const sheet of OWNED_STYLESHEETS) {
      const css = read(sheet);
      const durations = css.match(/\b\d+m?s\b/g) ?? [];
      expect(durations, sheet).toHaveLength(0);
    }
  });

  it("reaches for no Tailwind colour utility", () => {
    for (const file of [
      "controls/Button.tsx",
      "controls/Chip.tsx",
      "controls/Switch.tsx",
      "display/Badge.tsx",
      "display/Table.tsx",
    ]) {
      const source = readFileSync(path.join(UI_DIR, file), "utf8");
      expect(source, file).not.toMatch(
        /\b(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|grey|zinc|blue|red|green|amber|yellow|indigo|violet)-\d{2,3}\b/,
      );
    }
  });
});

describe("tap targets", () => {
  it("the tokens set the floor at 44px, and 56px for children", () => {
    expect(TOKENS).toMatch(/--tap-min:\s*44px/);
    const kids = /\[data-tier="kids"\]\s*\{([\s\S]*?)\n {2}\}/.exec(TOKENS)?.[1] ?? "";
    expect(kids).toMatch(/--tap-min:\s*56px/);
  });

  it.each([
    ["controls/Button.module.css", ".root", "min-block-size: var(--tap-min)"],
    ["controls/IconButton.module.css", ".sm", "block-size: var(--tap-min)"],
    ["controls/Switch.module.css", ".root", "min-block-size: var(--tap-min)"],
    ["controls/Chip.module.css", ".interactive", "min-block-size: var(--tap-min)"],
    ["controls/Tabs.module.css", ".tab", "min-block-size: var(--tap-min)"],
    ["controls/Input.module.css", ".shell", "min-block-size: var(--tap-min)"],
    ["controls/Select.module.css", ".shell", "min-block-size: var(--tap-min)"],
    ["controls/Textarea.module.css", ".field", "min-block-size: calc(var(--tap-min) * 2)"],
    ["display/Table.module.css", ".headerContent", "min-block-size: var(--tap-min)"],
  ])("%s spends the tap token on %s", (sheet, selector, declaration) => {
    expect(ruleBody(read(sheet), selector)).toContain(declaration);
  });

  it.each(["adult", "kids"] as const)("every control wears the tap rule in the %s tier", (tier) => {
    renderSurface(h(Button, null, "Continue"), { tier });
    expect(screen.getByRole("button", { name: "Continue" }).className).toContain(buttonStyles.root);
    cleanup();

    renderSurface(h(IconButton, { label: "Menu", icon: null }), { tier });
    expect(screen.getByRole("button", { name: "Menu" }).className).toContain(
      tier === "kids" ? iconButtonStyles.md : iconButtonStyles.sm,
    );
    cleanup();

    renderSurface(h(Switch, { label: "Prompts" }), { tier });
    expect(screen.getByRole("switch").className).toContain(switchStyles.root);
    cleanup();

    renderSurface(h(Chip, { selected: false }, "Due"), { tier });
    expect(screen.getByRole("button", { name: "Due" }).className).toContain(chipStyles.interactive);
    cleanup();

    renderSurface(h(Input, { "aria-label": "Number" }), { tier });
    expect(screen.getByLabelText("Number").parentElement?.className).toContain(inputStyles.shell);
    cleanup();

    renderSurface(
      h(Tabs, { defaultValue: "a" }, h(TabList, { "aria-label": "Sections" }, h(Tab, { value: "a" }, "A"))),
      { tier },
    );
    expect(screen.getByRole("tab").className).toContain(tabsStyles.tab);
  });
});
