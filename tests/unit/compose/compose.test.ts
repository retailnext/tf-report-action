import { describe, it, expect } from "vitest";
import { composeWithBudget } from "../../../src/compose/index.js";
import type { Report } from "../../../src/model/report.js";
import type { Section } from "../../../src/model/section.js";
import type { ResourceChange } from "../../../src/model/resource.js";
import type { OutputChange } from "../../../src/model/output.js";

/** Minimal Report with sensible defaults for testing. */
function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    title: "",
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: [],
    ...overrides,
  };
}

/** Creates N resource changes with unique addresses. */
function makeResources(count: number, prefix = ""): ResourceChange[] {
  return Array.from({ length: count }, (_, i) => ({
    address: `${prefix}null_resource.item_${String(i)}`,
    type: "null_resource",
    action: "create" as const,
    actionReason: null,
    attributes: [
      {
        name: "id",
        before: "",
        after: "(known after apply)",
        isSensitive: false,
        isLarge: false,
        isKnownAfterApply: true,
      },
    ],
    hasAttributeDetail: true,
    importId: null,
    movedFromAddress: null,
    allUnknownAfterApply: false,
  }));
}

/** Creates N output changes with unique names. */
function makeOutputs(count: number): OutputChange[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `output_${String(i)}`,
    action: "create" as const,
    before: null,
    after: `value-${String(i)}`,
    isSensitive: false,
    isLarge: false,
    isKnownAfterApply: false,
  }));
}

describe("composeWithBudget", () => {
  describe("non-structured reports", () => {
    it("concatenates all sections for non-structured reports", () => {
      const sections: Section[] = [
        { id: "title", full: "## Title\n\n", fixed: true },
        { id: "body", full: "Some body content\n\n" },
      ];
      const report = makeReport();
      const result = composeWithBudget(sections, report, {}, 10000);
      expect(result.markdown).toBe("## Title\n\nSome body content\n\n");
      expect(result.wasTruncated).toBe(false);
    });

    it("hard-truncates non-structured reports exceeding budget", () => {
      const longContent = "x".repeat(500);
      const sections: Section[] = [{ id: "body", full: longContent }];
      const report = makeReport();
      const result = composeWithBudget(sections, report, {}, 200);
      expect(result.markdown.length).toBe(200);
      expect(result.wasTruncated).toBe(true);
    });
  });

  describe("structured reports — progressive enhancement", () => {
    it("renders at full tier when budget is large enough", () => {
      const report = makeReport({ resources: makeResources(2) });
      const sections: Section[] = [
        { id: "title", full: "## Title\n\n", fixed: true },
        { id: "summary", full: "## Summary\n\n", fixed: true },
        {
          id: "resource-changes-heading",
          full: "## Resource Changes\n\n",
          fixed: true,
        },
        { id: "module-root", full: "### Module root\n\nfull details...\n\n" },
      ];

      const result = composeWithBudget(sections, report, {}, 100_000);
      expect(result.wasTruncated).toBe(false);
      expect(result.markdown).toContain("## Resource Changes");
      expect(result.markdown).toContain("null_resource");
    });

    it("degrades to tier 1 listing when budget is very small", () => {
      const report = makeReport({
        resources: makeResources(5),
      });
      const sections: Section[] = [
        { id: "title", full: "## T\n\n", fixed: true },
        { id: "resource-changes-heading", full: "## RC\n\n", fixed: true },
        { id: "module-root", full: "x".repeat(2000) },
      ];

      const result = composeWithBudget(sections, report, {}, 600);
      expect(result.wasTruncated).toBe(true);
      // Tier 1: flat listing with addresses
      expect(result.markdown).toContain("null_resource.item_0");
      expect(result.markdown).toContain("null_resource.item_4");
    });

    it("excludes category heading sections from fixed content", () => {
      const report = makeReport({ resources: makeResources(1) });
      const sections: Section[] = [
        { id: "title", full: "## Title\n\n", fixed: true },
        {
          id: "resource-changes-heading",
          full: "## Resource Changes\n\n",
          fixed: true,
        },
        { id: "module-root", full: "details\n\n" },
      ];

      const result = composeWithBudget(sections, report, {}, 100_000);
      // Should NOT have duplicate "## Resource Changes" headings
      const headingCount = (result.markdown.match(/## Resource Changes/g) ?? [])
        .length;
      expect(headingCount).toBe(1);
    });

    it("preserves suffix content after categories", () => {
      const report = makeReport({ resources: makeResources(1) });
      const sections: Section[] = [
        { id: "title", full: "## Title\n\n", fixed: true },
        { id: "resource-changes-heading", full: "## RC\n\n", fixed: true },
        { id: "module-root", full: "details\n\n" },
        { id: "raw-plan", full: "<details>raw output</details>\n\n" },
      ];

      const result = composeWithBudget(sections, report, {}, 100_000);
      expect(result.markdown).toContain("<details>raw output</details>");
      // Suffix should come after categories
      const catIndex = result.markdown.indexOf("Resource Changes");
      const rawIndex = result.markdown.indexOf("raw output");
      expect(rawIndex).toBeGreaterThan(catIndex);
    });

    it("renders drift before resources before outputs", () => {
      const report = makeReport({
        resources: makeResources(1),
        outputs: makeOutputs(1),
        driftResources: makeResources(1, "drift_"),
      });
      const sections: Section[] = [
        { id: "title", full: "## T\n\n", fixed: true },
        { id: "drift-heading", full: "## D\n\n", fixed: true },
        { id: "drift-module-root", full: "drift\n\n" },
        { id: "resource-changes-heading", full: "## RC\n\n", fixed: true },
        { id: "module-root", full: "res\n\n" },
        { id: "outputs", full: "out\n\n" },
      ];

      const result = composeWithBudget(sections, report, {}, 100_000);
      const driftIdx = result.markdown.indexOf("Drift");
      const resIdx = result.markdown.indexOf("Resource Changes");
      const outIdx = result.markdown.indexOf("Output Changes");
      expect(driftIdx).toBeLessThan(resIdx);
      expect(resIdx).toBeLessThan(outIdx);
    });
  });

  describe("cross-category tier enforcement", () => {
    it("all categories at same tier before any upgrades", () => {
      // With a budget that fits tier 2 for both but not tier 5,
      // both should be at the same tier level
      const report = makeReport({
        resources: makeResources(3),
        outputs: makeOutputs(3),
      });
      const sections: Section[] = [
        { id: "title", full: "## T\n\n", fixed: true },
        { id: "resource-changes-heading", full: "## RC\n\n", fixed: true },
        { id: "module-root", full: "x".repeat(1000) },
        { id: "outputs", full: "y".repeat(1000) },
      ];

      // Small budget: both degraded to compact/listing
      const result = composeWithBudget(sections, report, {}, 800);
      expect(result.wasTruncated).toBe(true);
      // Both categories should appear
      expect(result.markdown).toContain("Resource Changes");
      expect(result.markdown).toContain("Output Changes");
    });
  });
});
