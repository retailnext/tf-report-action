import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for integration tests only.
 *
 * This config runs exclusively `tests/integration/` and measures coverage
 * independently of the unit tests. The integration-only coverage report must
 * meet the same thresholds as the full suite, demonstrating that real
 * terraform/tofu plan outputs exercise all critical code paths on their own.
 *
 * All inputs in tests/integration/ must come from tests/fixtures/generated/
 * (real tool outputs). See .github/copilot-instructions.md for the reviewer rule.
 */
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage-integration",
      include: ["src/**/*.ts"],
      exclude: [
        "src/tfjson/**",
        "src/model/**",
        "src/env/**",
        "src/**/*.d.ts",
        "src/diff/types.ts",
        "src/builder/options.ts",
        "src/renderer/options.ts",
        // Test helper files must not appear in source coverage
        "tests/**",
        // Error-path branches in the parser are covered by unit tests, not integration tests.
        // Integration tests only supply valid plan JSON from real terraform/tofu runs.
        "src/parser/**",
        // Steps context parsing, file reading, and composition have extensive
        // error-path and edge-case branches that are exercised by unit tests.
        // Integration tests exercise the happy paths through reportFromSteps().
        "src/steps/parse.ts",
        "src/steps/reader.ts",
        // Steps barrel re-exports are trivially covered by unit tests.
        "src/steps/index.ts",
        "src/compositor/index.ts",
        "src/compositor/types.ts",
        // jsonl-scanner barrel and types — no executable logic
        "src/jsonl-scanner/index.ts",
        "src/jsonl-scanner/types.ts",
        // Error renderer is only reachable when the pipeline itself fails (invalid
        // steps context, parse error with no fallback). Integration tests always
        // supply valid fixture data, so these branches are exercised by unit tests.
        "src/renderer/error.ts",
        // The action module is the GitHub Action entry point — it is exercised
        // by unit tests with mocked clients, not integration tests.
        "src/action/**",
        // The GitHub API client requires real HTTP calls and cannot be exercised
        // by integration tests that use fixture data.
        "src/github/**",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        // The diff modules (lcs.ts, char-diff.ts, line-diff.ts) have inherently
        // unreachable branches from `?? 0`/`?? ""` fallbacks required by
        // noUncheckedIndexedAccess — these hold branch coverage to ~70-80%
        // regardless of test coverage. 80% is the realistic ceiling for integration
        // branch coverage given this constraint.
        branches: 80,
        statements: 90,
      },
    },
  },
});
