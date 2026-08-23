import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import ar from "../../../../messages/ar.json";
import { translate } from "./translate";

type Node = Record<string, unknown>;

function flatten(node: Node, prefix = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const child = value as Node;
      // A plural object is a leaf, not a namespace.
      const isPlural = Object.keys(child).every((k) =>
        ["zero", "one", "two", "few", "many", "other"].includes(k),
      );
      return isPlural ? [path] : flatten(child, path);
    }
    return [path];
  });
}

describe("message bundles", () => {
  it("has the same keys in English and Arabic", () => {
    const enKeys = flatten(en as Node).sort();
    const arKeys = flatten(ar as Node).sort();
    expect(arKeys).toEqual(enKeys);
  });

  it("has no empty strings", () => {
    const walk = (node: Node, path = ""): void => {
      for (const [key, value] of Object.entries(node)) {
        const here = path ? `${path}.${key}` : key;
        if (typeof value === "string") expect(value.trim(), here).not.toBe("");
        else if (value && typeof value === "object") walk(value as Node, here);
      }
    };
    walk(en as Node);
    walk(ar as Node);
  });

  it("gives Arabic the plural forms Arabic actually has", () => {
    const forms = (ar as Node).count as Node;
    const dueReviews = forms.dueReviews as Record<string, string>;
    // Arabic distinguishes zero, one, two, few, many and other.
    expect(Object.keys(dueReviews).sort()).toEqual(["few", "many", "one", "other", "two", "zero"]);
  });

  it("selects the right Arabic plural form for a count", () => {
    expect(translate("ar", "count.dueReviews", { count: 1 })).not.toContain("{count}");
    expect(translate("ar", "count.dueReviews", { count: 2 })).not.toContain("{count}");
    expect(translate("ar", "count.dueReviews", { count: 3 })).toContain("3");
    expect(translate("ar", "count.dueReviews", { count: 11 })).toContain("11");
  });

  it("interpolates parameters in both languages", () => {
    expect(translate("en", "progress.ofReviewed", { done: 3, total: 7 })).toBe("3 of 7");
    expect(translate("ar", "progress.ofReviewed", { done: 3, total: 7 })).toContain("3");
  });

  it("returns the key itself when a message is missing, rather than an empty string", () => {
    expect(translate("en", "nothing.here.at.all")).toBe("nothing.here.at.all");
  });
});
