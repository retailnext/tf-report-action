import { describe, it, expect } from "vitest";
import { renderReport } from "../../../src/renderer/index.js";
import type { Report } from "../../../src/model/report.js";
import type { Summary } from "../../../src/model/summary.js";

const emptySummary: Summary = { actions: [], failures: [] };

/** Minimal report with no resources or outputs. */
function emptyReport(overrides: Partial<Report> = {}): Report {
  return {
    toolVersion: "1.0.0",
    formatVersion: "1.2",
    timestamp: null,
    summary: emptySummary,
    modules: [],
    outputs: [],
    ...overrides,
  };
}

describe("renderReport — apply-specific rendering", () => {
  it("uses 'Apply Summary' heading when diagnostics are present", () => {
    const report = emptyReport({ diagnostics: [] });
    const md = renderReport(report);
    expect(md).toContain("## Apply Summary");
    expect(md).not.toContain("## Plan Summary");
  });

  it("uses 'Apply Summary' heading when applyStatuses are present", () => {
    const report = emptyReport({
      applyStatuses: [
        { address: "null_resource.a", action: "create", success: true },
      ],
    });
    const md = renderReport(report);
    expect(md).toContain("## Apply Summary");
    expect(md).not.toContain("## Plan Summary");
  });

  it("uses 'Plan Summary' heading for plan-only reports", () => {
    const report = emptyReport();
    const md = renderReport(report);
    expect(md).toContain("## Plan Summary");
    expect(md).not.toContain("## Apply Summary");
  });

  it("renders non-resource diagnostics in top-level section", () => {
    const report = emptyReport({
      diagnostics: [
        {
          severity: "error",
          summary: "Provider error",
          detail: "connection refused",
        },
      ],
    });
    const md = renderReport(report);
    expect(md).toContain("## Errors");
    expect(md).toContain("🚨 **Provider error**");
  });

  it("renders resource-specific diagnostics inline on the resource", () => {
    const report = emptyReport({
      modules: [{
        moduleAddress: "",
        resources: [{
          address: "null_resource.broken",
          moduleAddress: null,
          type: "null_resource",
          name: "broken",
          action: "create",
          actionReason: null,
          attributes: [],
          importId: null,
          movedFromAddress: null,
          allUnknownAfterApply: false,
        }],
        outputs: [],
      }],
      diagnostics: [
        {
          severity: "error",
          summary: "Resource failed",
          detail: "timeout after 5m",
          address: "null_resource.broken",
        },
      ],
      applyStatuses: [
        { address: "null_resource.broken", action: "create", success: false },
      ],
    });
    const md = renderReport(report);
    // Resource-specific diagnostics should NOT appear in a top-level section
    expect(md).not.toContain("## Errors");
    expect(md).not.toContain("## Diagnostics");
    // Should appear inline in the resource details
    expect(md).toContain("🚨 **Resource failed**");
    expect(md).toContain("timeout after 5m");
  });

  it("opens <details> for failed resources", () => {
    const report = emptyReport({
      modules: [{
        moduleAddress: "",
        resources: [{
          address: "null_resource.broken",
          moduleAddress: null,
          type: "null_resource",
          name: "broken",
          action: "create",
          actionReason: null,
          attributes: [],
          importId: null,
          movedFromAddress: null,
          allUnknownAfterApply: false,
        }],
        outputs: [],
      }],
      applyStatuses: [
        { address: "null_resource.broken", action: "create", success: false },
      ],
    });
    const md = renderReport(report);
    expect(md).toContain("<details open>");
    expect(md).toContain("❌");
  });

  it("does not render resource outcomes table (removed)", () => {
    const report = emptyReport({
      applyStatuses: [
        { address: "null_resource.ok", action: "create", success: true },
      ],
    });
    const md = renderReport(report);
    expect(md).not.toContain("### Resource Outcomes");
  });

  it("omits diagnostics section when diagnostics array is empty", () => {
    const report = emptyReport({ diagnostics: [] });
    const md = renderReport(report);
    expect(md).not.toContain("## Errors");
    expect(md).not.toContain("## Warnings");
    expect(md).not.toContain("## Diagnostics");
  });

  it("renders VALUE_NOT_IN_PLAN sentinel in outputs as italic", () => {
    const report = emptyReport({
      outputs: [
        {
          name: "computed_val",
          action: "create",
          before: null,
          after: "(value not in plan)",
          isSensitive: false,
        },
      ],
    });
    const md = renderReport(report);
    expect(md).toContain("_(value not in plan)_");
    expect(md).not.toContain("<code>(value not in plan)</code>");
  });

  it("summary template renders all diagnostics in top-level section", () => {
    const report = emptyReport({
      diagnostics: [
        { severity: "warning", summary: "Deprecated", detail: "" },
        { severity: "error", summary: "Something failed", detail: "details", address: "null_resource.x" },
      ],
      applyStatuses: [
        { address: "a.b", action: "update", success: true },
      ],
    });
    const md = renderReport(report, { template: "summary" });
    expect(md).toContain("## Apply Summary");
    // Summary template puts ALL diagnostics in top-level section
    expect(md).toContain("⚠️ **Deprecated**");
    expect(md).toContain("🚨 **Something failed**");
    // No resource outcomes table
    expect(md).not.toContain("### Resource Outcomes");
  });

  it("uses past-tense labels in apply summary", () => {
    const report = emptyReport({
      summary: {
        actions: [{ action: "create", resourceTypes: [{ type: "null_resource", count: 1 }], total: 1 }],
        failures: [],
      },
      applyStatuses: [
        { address: "null_resource.a", action: "create", success: true },
      ],
    });
    const md = renderReport(report);
    expect(md).toContain("Added");
  });

  it("uses present-tense labels in plan summary", () => {
    const report = emptyReport({
      summary: {
        actions: [{ action: "create", resourceTypes: [{ type: "null_resource", count: 1 }], total: 1 }],
        failures: [],
      },
    });
    const md = renderReport(report);
    expect(md).toContain("Add");
    expect(md).not.toContain("Added");
  });
});
