import { describe, it, expect } from "vitest";
import { renderTitle, renderWorkspaceMarker } from "../../../src/renderer/title.js";
import type { Report } from "../../../src/model/report.js";

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

describe("renderTitle", () => {
  it("returns a fixed section with ## heading", () => {
    const report = makeReport({ title: "Terraform Plan" });
    const section = renderTitle(report);
    expect(section.id).toBe("title");
    expect(section.full).toBe("## Terraform Plan\n\n");
    expect(section.fixed).toBe(true);
  });

  it("includes the report title text verbatim", () => {
    const report = makeReport({ title: "❌ Plan Failed" });
    const section = renderTitle(report);
    expect(section.full).toBe("## ❌ Plan Failed\n\n");
  });
});

describe("renderWorkspaceMarker", () => {
  it("returns a fixed section with HTML comment containing workspace", () => {
    const report = makeReport({ title: "Terraform Plan", workspace: "production" });
    const section = renderWorkspaceMarker(report);
    expect(section).toBeDefined();
    expect(section!.id).toBe("marker");
    expect(section!.full).toBe('<!-- tf-report-action:"production" -->\n');
    expect(section!.fixed).toBe(true);
  });

  it("returns undefined when no workspace is set", () => {
    const report = makeReport({ title: "Terraform Plan" });
    expect(renderWorkspaceMarker(report)).toBeUndefined();
  });

  it("escapes special characters in workspace name", () => {
    const report = makeReport({ title: "Plan", workspace: 'my"workspace' });
    const section = renderWorkspaceMarker(report);
    expect(section).toBeDefined();
    expect(section!.full).toContain('my\\"workspace');
  });

  it("escapes --> in workspace name", () => {
    const report = makeReport({ title: "Plan", workspace: "ws-->end" });
    const section = renderWorkspaceMarker(report);
    expect(section).toBeDefined();
    expect(section!.full).toContain("ws--\\>end");
  });
});
