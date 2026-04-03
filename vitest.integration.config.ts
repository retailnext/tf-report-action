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
        "src/env/**",
        "src/**/*.d.ts",
        "src/diff/types.ts",
        "src/builder/options.ts",
        "src/renderer/options.ts",
        "src/renderer/render-mode.ts",
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
        // Step failure predicates (hasAnyFailedStep, hasAnyFailedKnownStep) require
        // specific failure patterns in the steps context not present in generated fixtures.
        // Core outcome functions (getStepOutcome, getExitCode, buildStepOutcomes) are
        // covered by integration tests; edge-case predicates are covered by unit tests.
        "src/steps/outcomes.ts",
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
        // The artifact module requires a live Actions runtime (JWT token, Twirp
        // service, Azure Blob Storage) and cannot be exercised with fixture data.
        "src/artifact/**",
        // The HTML page builder is a pure wrapper exercised only from the action
        // layer, not reachable through reportFromSteps/planToMarkdown/applyToMarkdown.
        "src/html/**",
        // The GitHub API client requires real HTTP calls and cannot be exercised
        // by integration tests that use fixture data.
        "src/github/**",
        // The HTTP transport, proxy detection, and retry modules require real HTTP
        // calls or network configuration and cannot be exercised by fixture-driven
        // integration tests.
        "src/http/**",
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
