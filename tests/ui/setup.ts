/**
 * Test setup.
 *
 * `@testing-library/jest-dom` matchers are registered only when a DOM is
 * present, so node-environment suites are unaffected.
 */
import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  const [{ cleanup }, matchers] = await Promise.all([
    import("@testing-library/react"),
    import("@testing-library/jest-dom/matchers"),
  ]);
  const { expect } = await import("vitest");
  expect.extend(matchers as never);
  afterEach(() => cleanup());
}
