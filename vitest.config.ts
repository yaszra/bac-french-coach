import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Engine and database tests run in node. Component tests opt into jsdom
    // with a `@vitest-environment jsdom` docblock, so the fast majority of
    // the suite never pays for a DOM.
    environment: "node",
    setupFiles: ["tests/ui/setup.ts"],
  },
});
