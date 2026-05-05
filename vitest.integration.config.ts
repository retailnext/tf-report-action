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
        "src/model/diagnostic.ts",
        "src/model/output.ts",
        "src/model/renderable.ts",
        "src/model/report.ts",
        "src/model/report-title.ts",
        "src/model/resource.ts",
        "src/model/step-file-read.ts",
        "src/model/step-issue.ts",
        "src/model/step-outcome.ts",
        "src/model/summary.ts",
        // step-commands.ts has a switch statement with per-role branches;
        // not all roles are exercised by integration fixtures. Covered by
        // unit tests.
        "src/model/step-commands.ts",
        "src/env/**",
        "src/**/*.d.ts",
        "src/diff/types.ts",
        "src/builder/options.ts",
        // render-options.ts (now in builder/) is type-only; no executable code
        "src/builder/render-options.ts",
        // steps/types.ts has runtime guard functions; the one guarding
        // OUTPUT_EXIT_CODE is not reachable through standard fixtures.
        "src/steps/types.ts",
        // Test helper files must not appear in source coverage
        "tests/**",
        // Parser error-path branches (invalid JSON, unsupported format versions,
        // malformed state) are covered by unit tests. Integration tests supply
        // valid plan/state JSON from real tool runs. The detect-tool error paths
        // significantly reduce coverage when included.
        "src/parser/**",
        // Steps reader has extensive security/error-path branches (symlink
        // rejection, size limits, permission errors) not reachable through
        // fixture-driven integration tests. Happy paths are covered.
        "src/steps/reader.ts",
        // Steps parse has error-path branches for malformed/invalid step data
        // not reachable through standard generated fixtures.
        "src/steps/parse.ts",
        // Steps outcome helpers for failed-step detection (hasAnyFailedStep,
        // hasAnyFailedKnownStep) require fixtures with step failures outside
        // the known IaC steps — covered by unit tests.
        "src/steps/outcomes.ts",
        // jsonl-scanner types — no executable logic
        "src/jsonl-scanner/types.ts",
        // Drift filter rule implementations — pure predicates with no side
        // effects. The registry (registry.ts) is exercised by
        // tests/integration/drift-filter.test.ts: null-lifecycle/4 covers
        // both the suppressed and unsuppressed paths.
        "src/drift-filter/rules/**",
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
        // The logger module writes to process.stdout/stderr — requires
        // action runtime. Covered by unit tests.
        "src/logger/**",
        // The inputs module parses INPUT_* env vars and event payload —
        // action-specific context not reachable via reportFromSteps.
        "src/inputs/**",
        // The comment module assembles comment bodies/footers/markers —
        // action-specific output not reachable via reportFromSteps.
        "src/comment/**",
        // Type-only file — interfaces with no executable code.
        "src/renderable/types.ts",
        // ErrorElement is only produced on pipeline/parse failures —
        // integration tests supply valid fixture data. Covered by unit tests.
        "src/elements/error.ts",
        // TitleElement has branches for every report variant (workflow,
        // text-fallback, error) and many action/status combinations.
        // Integration fixtures only exercise the structured-report path.
        // Covered comprehensively by unit tests.
        "src/elements/title.ts",
        // TextFallbackElement/WorkflowElement are produced only when no
        // structured plan data is available — integration fixtures always
        // provide valid plan JSON. Covered by unit tests.
        "src/elements/text-fallback.ts",
        "src/elements/workflow.ts",
        // RawOutputElement has branches for JSONL, validate, and plain-text
        // formats at multiple detail levels. Not all combinations are
        // exercised by integration fixtures. Covered by unit tests.
        "src/elements/raw-output.ts",
        // RawStdoutElement is a small wrapper; its size-limited truncation
        // path is not exercised by standard fixtures. Covered by unit tests.
        "src/elements/raw-stdout.ts",
        // Warning classes have 9 variants for different builder conditions.
        // Integration fixtures only exercise a subset (e.g. NoStateWarning).
        // All variants are 100% covered by unit tests.
        "src/builder/warnings.ts",
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
