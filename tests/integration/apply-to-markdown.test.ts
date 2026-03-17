import { describe, it, expect, beforeAll } from "vitest";
import { applyToMarkdown } from "../../src/index.js";
import type { Options } from "../../src/index.js";
import { discoverApplyFixtures } from "../helpers/fixture-loader.js";

const fixtures = discoverApplyFixtures();

beforeAll(() => {
  if (fixtures.length === 0) {
    throw new Error(
      "No apply fixture pairs (show-plan.stdout + apply.stdout) found under " +
        "tests/fixtures/generated/. Run: bash scripts/generate-fixtures.sh",
    );
  }
});

const OPTION_VARIANTS: { name: string; options: Options }[] = [
  { name: "default", options: {} },
];

describe("applyToMarkdown integration", () => {
  for (const { label, planJson, applyJsonl } of fixtures) {
    describe(label, () => {
      for (const { name, options } of OPTION_VARIANTS) {
        it(`renders without error and matches snapshot [${name}]`, () => {
          const result = applyToMarkdown(planJson, applyJsonl, options);
          expect(result).toMatchSnapshot();
        });
      }
    });
  }

  // --- Targeted assertions for key scenarios ---

  describe("deferred-data-source/2 phantom filtering", () => {
    const fixture = fixtures.find(
      (f) => f.label === "terraform/deferred-data-source/2",
    );

    it("excludes phantom resources (worker_b, worker_c)", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      // terraform_data.worker_b and worker_c should NOT appear as resource
      // change summaries. They may appear as data values inside attribute
      // diffs or output values, which is expected.
      expect(result).not.toMatch(/terraform_data.*worker_b/);
      expect(result).not.toMatch(/terraform_data.*worker_c/);
    });

    it("includes actually-applied resources", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).toContain("worker_a");
      expect(result).toContain("local_file");
    });

    it("uses Apply Summary heading", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).toContain("## Apply Summary");
      expect(result).not.toContain("## Plan Summary");
    });

    it("does not show (known after apply)", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).not.toContain("(known after apply)");
    });

    it("shows resource details with action symbols", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).toContain("<details>");
      expect(result).toContain("worker_a");
    });
  });

  describe("removed-resource/1 forget operation (Terraform)", () => {
    const fixture = fixtures.find(
      (f) => f.label === "terraform/removed-resource/1",
    );

    it("includes the forgotten resource in apply output", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).toContain("ephemeral");
    });

    it("shows 👋 Forgotten in Apply Summary", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).toContain("👋");
      expect(result).toContain("Forgotten");
    });

    it("uses Apply Summary heading (not Plan Summary)", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).toContain("## Apply Summary");
      expect(result).not.toContain("## Plan Summary");
    });

    it("does not show No Changes", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).not.toContain("No Changes");
    });
  });

  describe("removed-resource/1 forget operation (OpenTofu)", () => {
    const fixture = fixtures.find((f) => f.label === "tofu/removed-resource/1");

    it("includes the forgotten resource in apply output", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).toContain("ephemeral");
    });

    it("shows 👋 Forgotten in Apply Summary", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).toContain("👋");
      expect(result).toContain("Forgotten");
    });

    it("uses Apply Summary heading (not Plan Summary)", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).toContain("## Apply Summary");
      expect(result).not.toContain("## Plan Summary");
    });

    it("does not show No Changes", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).not.toContain("No Changes");
    });
  });

  for (const toolLabel of [
    "terraform/moved-resource/1",
    "tofu/moved-resource/1",
  ]) {
    describe(`${toolLabel} move operation`, () => {
      const fixture = fixtures.find((f) => f.label === toolLabel);

      it("includes the moved resource in apply output", () => {
        expect(fixture).toBeDefined();
        const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
        expect(result).toContain("renamed");
      });

      it("shows 🚚 Moved in Apply Summary", () => {
        expect(fixture).toBeDefined();
        const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
        expect(result).toContain("🚚");
        expect(result).toContain("Moved");
      });

      it("uses Apply Summary heading (not Plan Summary)", () => {
        expect(fixture).toBeDefined();
        const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
        expect(result).toContain("## Apply Summary");
        expect(result).not.toContain("## Plan Summary");
      });

      it("does not show No Changes", () => {
        expect(fixture).toBeDefined();
        const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
        expect(result).not.toContain("No Changes");
      });
    });
  }

  for (const toolLabel of [
    "terraform/import-resource/1",
    "tofu/import-resource/1",
  ]) {
    describe(`${toolLabel} state-only import`, () => {
      const fixture = fixtures.find((f) => f.label === toolLabel);

      it("includes the imported resource in apply output", () => {
        expect(fixture).toBeDefined();
        const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
        expect(result).toContain("imported");
      });

      it("shows 📥 Imported in Apply Summary", () => {
        expect(fixture).toBeDefined();
        const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
        expect(result).toContain("📥");
        expect(result).toContain("Imported");
      });

      it("uses Apply Summary heading (not Plan Summary)", () => {
        expect(fixture).toBeDefined();
        const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
        expect(result).toContain("## Apply Summary");
        expect(result).not.toContain("## Plan Summary");
      });

      it("does not show No Changes", () => {
        expect(fixture).toBeDefined();
        const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
        expect(result).not.toContain("No Changes");
      });
    });
  }

  describe("apply-error/1 error handling", () => {
    const fixture = fixtures.find((f) => f.label === "terraform/apply-error/1");

    it("shows failed resource with error indicator", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).toContain("❌");
      expect(result).toContain("will_fail");
    });

    it("excludes skipped dependent resource", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      // terraform_data.depends_on_fail is a phantom — planned but never applied.
      // It should not appear as a resource change (but may appear as part of
      // output names like "depends_on_fail_output").
      expect(result).not.toMatch(/terraform_data.*depends_on_fail/);
    });

    it("includes inline error diagnostic for failed resource", () => {
      expect(fixture).toBeDefined();
      const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl);
      expect(result).toContain("local-exec provisioner error");
    });
  });
});

// ---------- State enrichment via applyToMarkdown ----------

describe("applyToMarkdown — state enrichment", () => {
  it("resolves unknown values when stateJson is provided", () => {
    const fixture = fixtures.find((f) => f.label === "tofu/null-lifecycle/2");
    expect(fixture).toBeDefined();
    expect(fixture!.stateJson).toBeDefined();
    const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl, {
      stateJson: fixture!.stateJson,
    });
    expect(result).not.toContain("(value not in plan)");
  });

  it("masks sensitive state values in applyToMarkdown", () => {
    const fixture = fixtures.find((f) => f.label === "tofu/sensitive-values/1");
    expect(fixture).toBeDefined();
    expect(fixture!.stateJson).toBeDefined();
    const result = applyToMarkdown(fixture!.planJson, fixture!.applyJsonl, {
      stateJson: fixture!.stateJson,
    });
    expect(result).not.toContain("updated-secret-value");
  });

  // Snapshot with state enrichment for all fixtures that have state
  for (const { label, planJson, applyJsonl, stateJson } of fixtures) {
    if (stateJson === undefined) continue;
    it(`state-enriched snapshot: ${label}`, () => {
      const result = applyToMarkdown(planJson, applyJsonl, { stateJson });
      expect(result).toMatchSnapshot();
    });
  }
});

// ---------- Security: sensitive values must never appear in output ----------

describe("applyToMarkdown — sensitive value masking", () => {
  const FORBIDDEN_STRINGS = ["initial-secret-value", "updated-secret-value"];

  for (const { label, planJson, applyJsonl } of fixtures) {
    if (!label.includes("sensitive-values")) continue;
    for (const { name, options } of OPTION_VARIANTS) {
      it(`${label} [${name}]: no sensitive values in output`, () => {
        const result = applyToMarkdown(planJson, applyJsonl, options);
        for (const secret of FORBIDDEN_STRINGS) {
          expect(result, `leaked "${secret}"`).not.toContain(secret);
        }
      });
    }
  }
});
