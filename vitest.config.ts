import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/tfjson/**", // copied type definitions — no executable code
        "src/model/**", // interface-only files — no executable code
        "src/env/**", // type alias only — no executable code
        "src/**/*.d.ts",
        // Type-only files with no executable code
        "src/diff/types.ts",
        "src/builder/options.ts",
        "src/renderer/options.ts",
        // Test helper files must not appear in source coverage
        "tests/**",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
