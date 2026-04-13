import { describe, it, expect } from "vitest";
import { composeProgressively } from "../../../src/compose/progressive.js";
import type { Report } from "../../../src/model/report.js";
import type { ResourceChange } from "../../../src/model/resource.js";
import type { OutputChange } from "../../../src/model/output.js";

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

describe("composeProgressively", () => {
  it("returns prefix + suffix when no categories have content", () => {
    const report = makeReport();
    const result = composeProgressively("PREFIX", "SUFFIX", report, {}, 10000);
    expect(result.markdown).toBe("PREFIXSUFFIX");
    expect(result.wasTruncated).toBe(false);
  });

  it("includes all categories when budget allows full rendering", () => {
    const report = makeReport({
      resources: makeResources(2),
      outputs: makeOutputs(1),
    });
    const result = composeProgressively("## T\n\n", "", report, {}, 100_000);
    expect(result.wasTruncated).toBe(false);
    expect(result.markdown).toContain("## Resource Changes");
    expect(result.markdown).toContain("## Output Changes");
    expect(result.markdown).toContain("null_resource.item_0");
  });

  it("degrades to tier 1 when budget is tight", () => {
    const resources = makeResources(10);
    const report = makeReport({ resources });
    const prefix = "## T\n\n";
    // Budget too small for module-grouped rendering
    const result = composeProgressively(prefix, "", report, {}, 700);
    expect(result.wasTruncated).toBe(true);
    // Tier 1: flat listing
    expect(result.markdown).toContain("null_resource.item_0");
    expect(result.markdown).toContain("null_resource.item_9");
  });

  it("places categories between prefix and suffix", () => {
    const report = makeReport({ resources: makeResources(1) });
    const result = composeProgressively(
      "PREFIX\n",
      "\nSUFFIX",
      report,
      {},
      100_000,
    );
    const prefixIdx = result.markdown.indexOf("PREFIX");
    const catIdx = result.markdown.indexOf("Resource Changes");
    const suffixIdx = result.markdown.indexOf("SUFFIX");
    expect(prefixIdx).toBeLessThan(catIdx);
    expect(catIdx).toBeLessThan(suffixIdx);
  });

  it("reports wasTruncated when any category below tier 5", () => {
    // Many resources to ensure tier 5 is too large for the budget
    const report = makeReport({ resources: makeResources(10) });
    const result = composeProgressively("", "", report, {}, 800);
    expect(result.wasTruncated).toBe(true);
  });

  it("displays drift before resources before outputs", () => {
    const report = makeReport({
      resources: makeResources(1),
      outputs: makeOutputs(1),
      driftResources: makeResources(1, "drift_"),
    });
    const result = composeProgressively("", "", report, {}, 100_000);
    const driftIdx = result.markdown.indexOf("Drift");
    const resIdx = result.markdown.indexOf("Resource Changes");
    const outIdx = result.markdown.indexOf("Output Changes");
    expect(driftIdx).toBeLessThan(resIdx);
    expect(resIdx).toBeLessThan(outIdx);
  });

  it("upgrades resources before outputs when budget allows", () => {
    const report = makeReport({
      resources: makeResources(1),
      outputs: makeOutputs(1),
    });
    // Budget that allows tier 5 for resources but only tier 2 for outputs
    const fullResult = composeProgressively("", "", report, {}, 100_000);
    const tightResult = composeProgressively(
      "",
      "",
      report,
      {},
      fullResult.markdown.length - 100,
    );
    // Resources should have more detail than outputs at tight budget
    expect(tightResult.markdown).toContain("Resource Changes");
    expect(tightResult.markdown).toContain("Output Changes");
  });

  it("never exceeds the budget", () => {
    const report = makeReport({
      resources: makeResources(20),
      outputs: makeOutputs(5),
      driftResources: makeResources(3, "drift_"),
    });
    const budget = 2000;
    const result = composeProgressively(
      "PREFIX\n",
      "\nSUFFIX",
      report,
      {},
      budget,
    );
    expect(result.markdown.length).toBeLessThanOrEqual(budget);
  });

  it("never exceeds budget even when tier-1 alone would overflow", () => {
    // Many resources with long addresses — tier 1 unconstrained would be huge
    const resources = makeResources(200, "module.very_long_module_name.");
    const report = makeReport({ resources });
    const budget = 1500;
    const result = composeProgressively("## Title\n\n", "", report, {}, budget);
    expect(result.markdown.length).toBeLessThanOrEqual(budget);
    expect(result.wasTruncated).toBe(true);
  });

  it("uniform phase advances all categories together before individual upgrades", () => {
    // With a generous budget, all categories should reach tier 5 together
    const report = makeReport({
      resources: makeResources(2),
      outputs: makeOutputs(2),
    });
    const result = composeProgressively("", "", report, {}, 100_000);
    expect(result.wasTruncated).toBe(false);
    // Both categories fully rendered
    expect(result.markdown).toContain("Resource Changes");
    expect(result.markdown).toContain("Output Changes");
  });
});
