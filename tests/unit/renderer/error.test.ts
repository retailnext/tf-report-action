import { describe, it, expect } from "vitest";
import { renderErrorBody } from "../../../src/renderer/error.js";
import type { Report } from "../../../src/model/report.js";

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    title: "Error",
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: [],
    error: "Something went wrong.",
    ...overrides,
  };
}

describe("renderErrorBody", () => {
  it("renders error message as a section", () => {
    const report = makeReport({ error: "Plan parsing failed." });
    const sections = renderErrorBody(report);
    const msg = sections.find((s) => s.id === "message");
    expect(msg).toBeDefined();
    expect(msg!.full).toBe("Plan parsing failed.\n\n");
  });

  it("renders step status table when steps are present", () => {
    const report = makeReport({
      steps: [
        { id: "init", outcome: "success" },
        { id: "plan", outcome: "failure" },
      ],
    });
    const sections = renderErrorBody(report);
    const stepTable = sections.find((s) => s.id === "step-statuses");
    expect(stepTable).toBeDefined();
    expect(stepTable!.full).toContain("### Steps");
    expect(stepTable!.full).toContain("| `init` | success |");
    expect(stepTable!.full).toContain("| `plan` | failure |");
  });

  it("does not render step table when steps array is empty", () => {
    const report = makeReport();
    const sections = renderErrorBody(report);
    expect(sections.find((s) => s.id === "step-statuses")).toBeUndefined();
  });

  it("does not render step table when steps array is explicitly empty", () => {
    const report = makeReport({ steps: [] });
    const sections = renderErrorBody(report);
    expect(sections.find((s) => s.id === "step-statuses")).toBeUndefined();
  });
});
