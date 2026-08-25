// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SurfaceProvider } from "../theme/ThemeProvider";
import { LearnerShell, ParentShell } from "../shells";

/**
 * What a shell's navigation actually renders.
 *
 * This exists because of a defect that no other test could see: the family
 * app passed a tutoring destination into `ParentShell`, and `ShellNav` renders
 * the `destinations` list while reading `items` only for hrefs and badges — so
 * the entry was accepted, ignored, and silently absent. Every test passed. It
 * was found by looking at the screen.
 *
 * The two shells want opposite things from the same component, which is why
 * the mistake was easy: the learner shell narrows its list by tier and must
 * NOT let a caller widen it; the family shell's list is genuinely variable.
 * Both are asserted here.
 */
afterEach(cleanup);

function Surface({ children, tier = "adult" as const }: { children: React.ReactNode; tier?: "kids" | "teen" | "adult" }) {
  return (
    <SurfaceProvider theme="light" tier={tier} locale="en">
      {children}
    </SurfaceProvider>
  );
}

describe("the family shell's navigation", () => {
  it("renders the destinations the caller supplies, including tutoring", () => {
    render(
      <Surface>
        <ParentShell
          active="children"
          items={[
            { id: "children", href: "/children" },
            { id: "tonight", href: "/tonight" },
            { id: "tutor", href: "/tutor" },
            { id: "settings", href: "/settings" },
          ]}
        >
          <p>content</p>
        </ParentShell>
      </Surface>,
    );
    expect(screen.getByRole("link", { name: "Tutoring" })).toHaveProperty("href");
  });

  it("omits tutoring when the caller does not offer it", () => {
    render(
      <Surface>
        <ParentShell
          active="children"
          items={[
            { id: "children", href: "/children" },
            { id: "tonight", href: "/tonight" },
            { id: "settings", href: "/settings" },
          ]}
        >
          <p>content</p>
        </ParentShell>
      </Surface>,
    );
    expect(screen.queryByRole("link", { name: "Tutoring" })).toBeNull();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
  });

  it("falls back to its own three destinations when given no items", () => {
    render(
      <Surface>
        <ParentShell active="children">
          <p>content</p>
        </ParentShell>
      </Surface>,
    );
    for (const label of ["Children", "Tonight", "Settings"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("Tutoring")).toBeNull();
  });
});

describe("the learner shell's navigation", () => {
  it("keeps a young learner's shorter list even when the caller offers more", () => {
    render(
      <Surface tier="kids">
        <LearnerShell
          active="today"
          items={[
            { id: "today", href: "/today" },
            { id: "quran", href: "/quran" },
            { id: "reading", href: "/reading" },
            { id: "practice", href: "/practice" },
            { id: "me", href: "/me" },
          ]}
        >
          <p>content</p>
        </LearnerShell>
      </Surface>,
    );
    // The tier policy decides how many doors a child is given. A caller
    // passing five must not be able to widen it back.
    const links = screen.getAllByRole("link");
    expect(links.length).toBeLessThan(5);
  });
});
