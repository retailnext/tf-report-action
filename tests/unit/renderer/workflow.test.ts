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

  it("renders 'No steps' message when steps array is empty", () => {
    const report = makeReport({ steps: [] });
    const sections = renderWorkflowBody(report);
    const noSteps = sections.find((s) => s.id === "no-steps");
    expect(noSteps).toBeDefined();
    expect(noSteps!.full).toContain("No steps were found");
  });

  it("includes logs link when logsUrl is provided", () => {
    const report = makeReport({
      steps: [{ id: "plan", outcome: "success" }],
      logsUrl: "https://github.com/owner/repo/actions/runs/123",
    });
    const sections = renderWorkflowBody(report);
    const link = sections.find((s) => s.id === "logs-link");
    expect(link).toBeDefined();
    expect(link!.full).toContain("[View workflow run logs]");
    expect(link!.full).toContain(
      "https://github.com/owner/repo/actions/runs/123",
    );
  });

  it("does not include logs link when logsUrl is not set", () => {
    const report = makeReport({
      steps: [{ id: "plan", outcome: "success" }],
    });
    const sections = renderWorkflowBody(report);
    expect(sections.find((s) => s.id === "logs-link")).toBeUndefined();
  });
});
