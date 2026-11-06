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
 * - Sensitive path: `update-drift/1` drift changes the non-sensitive `size`
 *   and the sensitive `contents`. A rule that suppresses `size`-only drift must
 *   see `contents` as changed, even though both of its sides are masked, so
 *   the drift stays in the output.
 *
 * Individual rule implementations live in `src/drift-filter/rules/` and are
 * covered by unit tests. This file only exercises the registry mechanism and
 * its integration with `planToMarkdown`.
 */
import { beforeAll, describe, it, expect } from "vitest";
import { planToMarkdown } from "../../src/pipelines/plan.js";
import {
  DriftRuleRegistry,
  type DriftRule,
} from "../../src/drift-filter/registry.js";
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

  // update-drift/1 has one resource_drift entry: filesystem_file_writer whose
  // `contents` (sensitive on both sides) and `size` (not sensitive) changed.
  describe.each(["terraform", "tofu"])(
    "sensitive attribute changes (%s update-drift/1)",
    (tool) => {
      const sensitivePath = join(
        __dirname,
        `../fixtures/generated/${tool}/update-drift/1/show-plan.stdout`,
      );

      const sizeOnly: DriftRule = (type, _mode, attributes) => {
        if (type !== "filesystem_file_writer") return false;
        const changed = attributes.filter((a) => a.before !== a.after);
        return changed.length > 0 && changed.every((a) => a.name === "size");
      };

      it("keeps drift when a sensitive attribute also changed", () => {
        const json = readFileSync(sensitivePath, "utf-8");
        const result = planToMarkdown(json, {
          driftRuleRegistry: new DriftRuleRegistry().register(sizeOnly),
        });
        expect(result).toContain("Resource Drift");
        expect(result).toContain("filesystem_file_writer.managed");
      });

      it("suppresses drift when the rule also accepts the sensitive attribute", () => {
        const json = readFileSync(sensitivePath, "utf-8");
        const sizeAndContents: DriftRule = (type, _mode, attributes) => {
          if (type !== "filesystem_file_writer") return false;
          const changed = attributes.filter((a) => a.before !== a.after);
          return (
            changed.length > 0 &&
            changed.every((a) => a.name === "size" || a.name === "contents")
          );
        };
        const result = planToMarkdown(json, {
          driftRuleRegistry: new DriftRuleRegistry().register(sizeAndContents),
        });
        expect(result).not.toContain("Resource Drift");
      });
    },
  );
});
