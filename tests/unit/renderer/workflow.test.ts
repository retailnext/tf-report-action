import { describe, it, expect } from "vitest";
import { renderWorkflowBody } from "../../../src/renderer/workflow.js";
import type { Report } from "../../../src/model/report.js";

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    title: "Terraform Plan",
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: [],
    ...overrides,
  };
}

describe("renderWorkflowBody", () => {
  it("renders step table when steps are present", () => {
    const report = makeReport({
      steps: [
        { id: "init", outcome: "success" },
        { id: "plan", outcome: "success" },
      ],
    });
    const sections = renderWorkflowBody(report);
    const table = sections.find((s) => s.id === "step-table");
    expect(table).toBeDefined();
    expect(table!.full).toContain("| `init` | success |");
    expect(table!.full).toContain("| `plan` | success |");
  });

  it("does not include a logs link (caller is responsible for the footer)", () => {
    const report = makeReport({
      steps: [{ id: "plan", outcome: "success" }],
      logsUrl: "https://github.com/owner/repo/actions/runs/123",
    });
    const sections = renderWorkflowBody(report);
    expect(sections.find((s) => s.id === "logs-link")).toBeUndefined();
    expect(sections.some((s) => s.full.includes("View"))).toBe(false);
  });

  it("does not include logs link when logsUrl is not set", () => {
    const report = makeReport({
      steps: [{ id: "plan", outcome: "success" }],
    });
    const sections = renderWorkflowBody(report);
    expect(sections.find((s) => s.id === "logs-link")).toBeUndefined();
  });
});
