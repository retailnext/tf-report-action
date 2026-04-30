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
        "src/tfjson/**", // type-only: all imports are `import type`, consts exist for type derivation
        // model type-only files (no executable code)
        "src/model/apply-status.ts",
        "src/model/attribute.ts",
        "src/model/diagnostic.ts",
        "src/model/index.ts", // barrel re-exports; tests import from specific files
        "src/model/output.ts",
        "src/model/render-options.ts",
        "src/model/report.ts",
        "src/model/resource.ts",
        "src/model/step-file-read.ts",
        "src/model/step-issue.ts",
        "src/model/step-outcome.ts",
        "src/model/summary.ts",
        "src/env/**", // type alias only — no executable code
        "src/**/*.d.ts",
        // Type-only files with no executable code
        "src/diff/types.ts",
        "src/builder/options.ts",
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
