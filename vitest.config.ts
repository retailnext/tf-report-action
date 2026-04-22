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
        "src/model/composition-result.ts",
        "src/model/diagnostic.ts",
        "src/model/index.ts", // barrel re-exports; tests import from specific files
        "src/model/output.ts",
        "src/model/render-options.ts",
        "src/model/report.ts",
        "src/model/resource.ts",
        "src/model/section.ts",
        "src/model/step-file-read.ts",
        "src/model/step-issue.ts",
        "src/model/step-outcome.ts",
        "src/model/summary.ts",
        "src/env/**", // type alias only — no executable code
        "src/**/*.d.ts",
        // Type-only files with no executable code
        "src/diff/types.ts",
        "src/builder/options.ts",
        "src/renderer/options.ts",
        "src/renderer/render-mode.ts",
        // Dead code — superseded by src/elements/ and src/renderable/ (Phase 4).
        // Will be deleted in Phase 5 cleanup.
        "src/renderer/**",
        "src/compose/**",
        "src/raw-formatter/**",
        "src/diff/context-diff.ts", // only used by old renderer
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
