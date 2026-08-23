import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  // The root tsconfig sets jsx: "preserve" because Next compiles JSX itself.
  // Vitest has no Next compiler, so esbuild is told to transform JSX here, and
  // tsconfigRaw stops it reading "preserve" back out of the tsconfig. This is
  // what lets component tests live beside their components without each
  // directory carrying its own tsconfig.
  esbuild: {
    jsx: "automatic",
    tsconfigRaw: { compilerOptions: { jsx: "react-jsx", useDefineForClassFields: true } },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.mjs"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          // integration tests provision a temp database; run serially
          pool: "forks",
          maxWorkers: 1,
        },
      },
    ],
  },
});
