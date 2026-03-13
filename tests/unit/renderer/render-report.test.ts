import { describe, it, expect } from "vitest";
import { renderReport } from "../../../src/renderer/index.js";
import type { Report } from "../../../src/model/report.js";

/** Minimal report with no resources or outputs. */
function emptyReport(overrides: Partial<Report> = {}): Report {
  return {
    toolVersion: "1.0.0",
    formatVersion: "1.2",
    timestamp: null,
    summary: { add: 0, change: 0, destroy: 0, replace: 0, total: 0 },
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

  it("renders diagnostics section with errors", () => {
    const report = emptyReport({
      diagnostics: [
        {
          severity: "error",
          summary: "Resource failed",
          detail: "timeout after 5m",
          address: "null_resource.broken",
        },
      ],
    });
    const md = renderReport(report);
    expect(md).toContain("## Diagnostics");
    expect(md).toContain("🚨 **Resource failed**");
    expect(md).toContain("`null_resource.broken`");
  });

  it("renders resource outcomes table", () => {
    const report = emptyReport({
      applyStatuses: [
        { address: "null_resource.ok", action: "create", success: true, elapsed: 2 },
        { address: "null_resource.fail", action: "create", success: false },
      ],
    });
    const md = renderReport(report);
    expect(md).toContain("### Resource Outcomes");
    expect(md).toContain("✅");
    expect(md).toContain("❌");
    expect(md).toContain("`null_resource.ok`");
    expect(md).toContain("`null_resource.fail`");
  });

  it("omits diagnostics section when diagnostics array is empty", () => {
    const report = emptyReport({ diagnostics: [] });
    const md = renderReport(report);
    expect(md).not.toContain("## Diagnostics");
  });

  it("omits resource outcomes when applyStatuses array is empty", () => {
    const report = emptyReport({ applyStatuses: [] });
    const md = renderReport(report);
    expect(md).not.toContain("### Resource Outcomes");
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
    // Should NOT be wrapped in <code> tags
    expect(md).not.toContain("<code>(value not in plan)</code>");
  });

  it("summary template also shows apply heading and sections", () => {
    const report = emptyReport({
      diagnostics: [
        { severity: "warning", summary: "Deprecated", detail: "" },
      ],
      applyStatuses: [
        { address: "a.b", action: "update", success: true },
      ],
    });
    const md = renderReport(report, { template: "summary" });
    expect(md).toContain("## Apply Summary");
    expect(md).toContain("### Resource Outcomes");
    expect(md).toContain("## Diagnostics");
  });
});
