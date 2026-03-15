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
    driftModules: [],
    ...overrides,
  };
}

describe("renderReport — apply-specific rendering", () => {
  it("uses 'Apply Summary' heading when operation is apply", () => {
    const report = emptyReport({ operation: "apply", diagnostics: [] });
    const md = renderReport(report);
    expect(md).toContain("## Apply Summary");
    expect(md).not.toContain("## Plan Summary");
  });

  it("uses 'Apply Summary' heading when applyStatuses are present", () => {
    const report = emptyReport({
      operation: "apply",
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
      operation: "apply",
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
      operation: "apply",
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

  it("renders VALUE_NOT_IN_PLAN sentinel in outputs as code (placeholder, not diffed)", () => {
    const report = emptyReport({
      outputs: [
        {
          name: "computed_val",
          action: "create",
          before: null,
          after: "(value not in plan)",
          isSensitive: false,
          isKnownAfterApply: true,
        },
      ],
    });
    const md = renderReport(report);
    // Placeholder values are rendered as inline code, never char-diffed
    expect(md).toContain("<code>(value not in plan)</code>");
  });

  it("summary template renders all diagnostics in top-level section", () => {
    const report = emptyReport({
      operation: "apply",
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
      operation: "apply",
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

describe("renderReport — drift section", () => {
  const driftResource = {
    address: "aws_instance.web",
    moduleAddress: null,
    type: "aws_instance",
    name: "web",
    action: "update" as const,
    actionReason: null,
    attributes: [],
    importId: null,
    movedFromAddress: null,
    allUnknownAfterApply: false,
  };

  it("does not render drift section when driftModules is empty", () => {
    const report = emptyReport();
    const md = renderReport(report);
    expect(md).not.toContain("Resource Drift");
    expect(md).not.toContain("🔀");
  });

  it("renders drift section with correct heading and count", () => {
    const report = emptyReport({
      driftModules: [
        {
          moduleAddress: "",
          resources: [driftResource],
          outputs: [],
        },
      ],
    });
    const md = renderReport(report);
    expect(md).toContain("🔀 Resource Drift (1 detected)");
  });

  it("renders drift resources within module groups", () => {
    const report = emptyReport({
      driftModules: [
        {
          moduleAddress: "",
          resources: [driftResource],
          outputs: [],
        },
        {
          moduleAddress: "module.network",
          resources: [
            { ...driftResource, address: "module.network.aws_vpc.main", moduleAddress: "module.network", type: "aws_vpc", name: "main" },
          ],
          outputs: [],
        },
      ],
    });
    const md = renderReport(report);
    expect(md).toContain("🔀 Resource Drift (2 detected)");
    expect(md).toContain("Module: root");
    expect(md).toContain("Module: `module.network`");
    expect(md).toContain("<strong>aws_instance</strong> web");
    expect(md).toContain("<strong>aws_vpc</strong> main");
  });

  it("drift section appears between summary and resource changes", () => {
    const report = emptyReport({
      modules: [
        {
          moduleAddress: "",
          resources: [{
            address: "null_resource.planned",
            moduleAddress: null,
            type: "null_resource",
            name: "planned",
            action: "create",
            actionReason: null,
            attributes: [],
            importId: null,
            movedFromAddress: null,
            allUnknownAfterApply: false,
          }],
          outputs: [],
        },
      ],
      driftModules: [
        {
          moduleAddress: "",
          resources: [driftResource],
          outputs: [],
        },
      ],
    });
    const md = renderReport(report);
    const summaryIdx = md.indexOf("Plan Summary");
    const driftIdx = md.indexOf("Resource Drift");
    const changesIdx = md.indexOf("Resource Changes");

    expect(summaryIdx).toBeGreaterThan(-1);
    expect(driftIdx).toBeGreaterThan(-1);
    expect(changesIdx).toBeGreaterThan(-1);
    expect(driftIdx).toBeGreaterThan(summaryIdx);
    expect(driftIdx).toBeLessThan(changesIdx);
  });
});
