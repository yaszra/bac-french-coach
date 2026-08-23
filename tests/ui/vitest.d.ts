/**
 * jest-dom matcher types for the component suites.
 *
 * Registered at runtime in tests/ui/setup.ts; declared here so the strict
 * typecheck sees them too, rather than the suite silently opting out of
 * type safety.
 */
import "vitest";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
  interface Assertion<T = unknown> extends TestingLibraryMatchers<unknown, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, void> {}
}
