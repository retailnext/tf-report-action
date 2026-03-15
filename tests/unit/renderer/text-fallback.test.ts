import { describe, it, expect } from "vitest";
import { renderTextFallbackBody } from "../../../src/renderer/text-fallback.js";
import type { TextFallbackReport } from "../../../src/model/report.js";

function makeReport(overrides: Partial<Omit<TextFallbackReport, "kind">> = {}): TextFallbackReport {
  return {
    kind: "text-fallback",
    title: "Terraform Plan",
    tool: undefined,
    fallbackReason: "show-plan-unavailable",
    issues: [],
    readErrors: [],
    steps: [],
    hasOutput: false,
    ...overrides,
  };
}

describe("renderTextFallbackBody", () => {
  it("renders warning note and plan output when plan content is available", () => {
    const report = makeReport({
      hasOutput: true,
      planContent: "Plan: 1 to add, 0 to change, 0 to destroy.",
    });
    const sections = renderTextFallbackBody(report);
    const note = sections.find((s) => s.id === "note");
    expect(note).toBeDefined();
    expect(note!.full).toContain("Warning:");
    expect(note!.full).toContain("show -json <tfplan>");
    expect(note!.full).toContain("was not available");
    expect(note!.fixed).toBe(true);

    const planOutput = sections.find((s) => s.id === "plan-output");
    expect(planOutput).toBeDefined();
    expect(planOutput!.full).toContain("### Plan Output");
    expect(planOutput!.full).toContain("Plan: 1 to add");
    expect(planOutput!.compact).toContain("_(omitted due to size)_");
  });

  it("renders 'No readable output' note and step table when no output", () => {
    const report = makeReport({
      hasOutput: false,
      steps: [
        { id: "init", outcome: "success" },
        { id: "plan", outcome: "failure" },
      ],
    });
    const sections = renderTextFallbackBody(report);
    const note = sections.find((s) => s.id === "note");
    expect(note).toBeDefined();
    expect(note!.full).toContain("No readable output was available");

    const stepTable = sections.find((s) => s.id === "step-statuses");
    expect(stepTable).toBeDefined();
    expect(stepTable!.full).toContain("| `init` | success |");
    expect(stepTable!.full).toContain("| `plan` | failure |");
  });

  it("renders both plan and apply output when both are present", () => {
    const report = makeReport({
      hasOutput: true,
      planContent: "Plan output text",
      applyContent: "Apply output text",
    });
    const sections = renderTextFallbackBody(report);
    const planSection = sections.find((s) => s.id === "plan-output");
    const applySection = sections.find((s) => s.id === "apply-output");
    expect(planSection).toBeDefined();
    expect(applySection).toBeDefined();
    expect(planSection!.full).toContain("### Plan Output");
    expect(applySection!.full).toContain("### Apply Output");
    expect(applySection!.compact).toContain("_(omitted due to size)_");
  });

  it("appends truncation indicator for truncated plan content", () => {
    const report = makeReport({
      hasOutput: true,
      planContent: "partial plan",
      planTruncated: true,
    });
    const sections = renderTextFallbackBody(report);
    const planSection = sections.find((s) => s.id === "plan-output");
    expect(planSection!.full).toContain("… (truncated)");
  });

  it("appends truncation indicator for truncated apply content", () => {
    const report = makeReport({
      hasOutput: true,
      applyContent: "partial apply",
      applyTruncated: true,
    });
    const sections = renderTextFallbackBody(report);
    const applySection = sections.find((s) => s.id === "apply-output");
    expect(applySection!.full).toContain("… (truncated)");
  });

  it("renders read errors as fixed sections", () => {
    const report = makeReport({
      readErrors: ["⚠️ Could not read plan file"],
    });
    const sections = renderTextFallbackBody(report);
    const errSection = sections.find((s) => s.id === "read-error-⚠️ Could not read plan file");
    expect(errSection).toBeDefined();
    expect(errSection!.full).toContain("### ⚠️ Could not read plan file");
    expect(errSection!.fixed).toBe(true);
  });

  it("does not render note section when there are read errors but no output", () => {
    const report = makeReport({
      hasOutput: false,
      readErrors: ["⚠️ Read error occurred"],
    });
    const sections = renderTextFallbackBody(report);
    const note = sections.find((s) => s.id === "note");
    expect(note).toBeUndefined();
  });

  it("does not render step table when output is available", () => {
    const report = makeReport({
      hasOutput: true,
      planContent: "plan text",
      steps: [{ id: "plan", outcome: "success" }],
    });
    const sections = renderTextFallbackBody(report);
    expect(sections.find((s) => s.id === "step-statuses")).toBeUndefined();
  });

  describe("warning note variants", () => {
    it("includes tool prefix when tool is 'tofu'", () => {
      const report = makeReport({
        hasOutput: true,
        tool: "tofu",
        fallbackReason: "show-plan-unavailable",
        planContent: "plan output",
      });
      const sections = renderTextFallbackBody(report);
      const note = sections.find((s) => s.id === "note");
      expect(note!.full).toContain("`tofu show -json <tfplan>`");
    });

    it("includes tool prefix when tool is 'terraform'", () => {
      const report = makeReport({
        hasOutput: true,
        tool: "terraform",
        fallbackReason: "show-plan-unavailable",
        planContent: "plan output",
      });
      const sections = renderTextFallbackBody(report);
      const note = sections.find((s) => s.id === "note");
      expect(note!.full).toContain("`terraform show -json <tfplan>`");
    });

    it("omits tool prefix when tool is undefined", () => {
      const report = makeReport({
        hasOutput: true,
        tool: undefined,
        fallbackReason: "show-plan-unavailable",
        planContent: "plan output",
      });
      const sections = renderTextFallbackBody(report);
      const note = sections.find((s) => s.id === "note");
      expect(note!.full).toContain("`show -json <tfplan>`");
      expect(note!.full).not.toContain("tofu");
      expect(note!.full).not.toContain("terraform");
    });

    it("shows 'not available' for show-plan-unavailable reason", () => {
      const report = makeReport({
        hasOutput: true,
        fallbackReason: "show-plan-unavailable",
        planContent: "plan output",
      });
      const sections = renderTextFallbackBody(report);
      const note = sections.find((s) => s.id === "note");
      expect(note!.full).toContain("was not available");
      expect(note!.full).not.toContain("not valid plan JSON");
    });

    it("shows parse error message for show-plan-parse-error reason", () => {
      const report = makeReport({
        hasOutput: true,
        tool: "tofu",
        fallbackReason: "show-plan-parse-error",
        planContent: "plan output",
      });
      const sections = renderTextFallbackBody(report);
      const note = sections.find((s) => s.id === "note");
      expect(note!.full).toContain("not valid plan JSON");
      expect(note!.full).toContain("Expected output from `tofu show -json <tfplan>`");
    });

    it("shows parse error message without tool for show-plan-parse-error when tool is undefined", () => {
      const report = makeReport({
        hasOutput: true,
        tool: undefined,
        fallbackReason: "show-plan-parse-error",
        planContent: "plan output",
      });
      const sections = renderTextFallbackBody(report);
      const note = sections.find((s) => s.id === "note");
      expect(note!.full).toContain("not valid plan JSON");
      expect(note!.full).toContain("Expected output from `show -json <tfplan>`");
    });
  });
});
