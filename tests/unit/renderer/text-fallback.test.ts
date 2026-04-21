import { describe, it, expect } from "vitest";
import { renderTextFallbackBody } from "../../../src/renderer/text-fallback.js";
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

describe("renderTextFallbackBody", () => {
  it("renders raw plan output with compact fallback", () => {
    const report = makeReport({
      rawStdout: [
        {
          stepId: "plan",
          label: "Plan Output",
          content: "Plan: 1 to add, 0 to change, 0 to destroy.",
        },
      ],
    });
    const sections = renderTextFallbackBody(report);
    const planOutput = sections.find((s) => s.id === "raw-plan");
    expect(planOutput).toBeDefined();
    expect(planOutput!.full).toContain("### Plan Output");
    expect(planOutput!.full).toContain("Plan: 1 to add");
    expect(planOutput!.compact).toContain("_(omitted due to size)_");
  });

  it("renders both plan and apply output when both are present", () => {
    const report = makeReport({
      rawStdout: [
        {
          stepId: "plan",
          label: "Plan Output",
          content: "Plan output text",
        },
        {
          stepId: "apply",
          label: "Apply Output",
          content: "Apply output text",
        },
      ],
    });
    const sections = renderTextFallbackBody(report);
    const planSection = sections.find((s) => s.id === "raw-plan");
    const applySection = sections.find((s) => s.id === "raw-apply");
    expect(planSection).toBeDefined();
    expect(applySection).toBeDefined();
    expect(planSection!.full).toContain("### Plan Output");
    expect(applySection!.full).toContain("### Apply Output");
    expect(applySection!.compact).toContain("_(omitted due to size)_");
  });

  it("does not append truncation indicators (truncation removed)", () => {
    const report = makeReport({
      rawStdout: [
        {
          stepId: "plan",
          label: "Plan Output",
          content: "partial plan",
        },
      ],
    });
    const sections = renderTextFallbackBody(report);
    const planSection = sections.find((s) => s.id === "raw-plan");
    expect(planSection!.full).not.toContain("… (truncated)");
  });

  it("does not render warnings (handled by renderReportSections)", () => {
    const report = makeReport({
      rawStdout: [
        {
          stepId: "plan",
          label: "Plan Output",
          content: "plan text",
        },
      ],
      warnings: ["Could not read plan file"],
    });
    const sections = renderTextFallbackBody(report);
    const warnSection = sections.find((s) => s.id.startsWith("warning-"));
    expect(warnSection).toBeUndefined();
  });
});
