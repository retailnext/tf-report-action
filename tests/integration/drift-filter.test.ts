/**
 * Integration tests for the drift suppression filter.
 *
 * These tests verify that `DriftRuleRegistry.shouldSuppressDrift()` is called
 * on the correct code paths using real fixture plan JSON:
 *
 * - Suppressed path: a custom "suppress all" rule is injected via
 *   `options.driftRuleRegistry`; the drift section disappears from output.
 * - Unsuppressed path: the default registry is used; no built-in rule matches
 *   `local_file` drift, so the section appears in the output.
 *
 * Individual rule implementations live in `src/drift-filter/rules/` and are
 * covered by unit tests. This file only exercises the registry mechanism and
 * its integration with `planToMarkdown`.
 */
import { beforeAll, describe, it, expect } from "vitest";
import { planToMarkdown, DriftRuleRegistry } from "../../src/index.js";
import type { DriftRule } from "../../src/index.js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// null-lifecycle/4 has one resource_drift entry: local_file (mode=managed, action=delete).
// None of the default rules match it, so it is shown in the report by default.
const FIXTURE_PATH = join(
  __dirname,
  "../fixtures/generated/tofu/null-lifecycle/4/show-plan.stdout",
);

beforeAll(() => {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(
      `Fixture not found: ${FIXTURE_PATH}. ` +
        "Run: bash scripts/generate-fixtures.sh",
    );
  }
});

describe("drift filter integration", () => {
  it("suppresses drift when a matching rule is registered", () => {
    const json = readFileSync(FIXTURE_PATH, "utf-8");
    const suppressAll: DriftRule = () => true;
    const registry = new DriftRuleRegistry().register(suppressAll);
    const result = planToMarkdown(json, { driftRuleRegistry: registry });
    // With all drift suppressed, the drift heading must not appear.
    expect(result).not.toContain("Resource Drift");
  });

  it("does not suppress drift when no rule matches", () => {
    const json = readFileSync(FIXTURE_PATH, "utf-8");
    // Default registry: none of the built-in rules match local_file drift.
    const result = planToMarkdown(json, {});
    expect(result).toContain("Resource Drift");
  });
});
