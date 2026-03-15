import { describe, it, expect } from "vitest";
import { renderReportSections } from "../../../src/renderer/report-sections.js";
import type {
  TextFallbackReport,
  WorkflowReport,
  ErrorReport,
  StructuredReport,
} from "../../../src/model/report.js";

describe("renderReportSections", () => {
  describe("structured report", () => {
    it("renders marker, title, and body for a structured report", () => {
      const report: StructuredReport = {
        kind: "structured",
        title: "Terraform Plan",
        issues: [],
        isApply: false,
        toolVersion: "1.5.0",
        formatVersion: "1.2",
        timestamp: null,
        summary: { actions: [], failures: [] },
        modules: [],
        outputs: [],
        driftModules: [],
        workspace: "staging",
      };
      const sections = renderReportSections(report);
      const ids = sections.map((s) => s.id);
      expect(ids).toContain("marker");
      expect(ids).toContain("title");
      expect(ids).toContain("report-body");

      const marker = sections.find((s) => s.id === "marker")!;
      expect(marker.full).toContain("staging");
      expect(marker.fixed).toBe(true);

      const title = sections.find((s) => s.id === "title")!;
      expect(title.full).toBe("## Terraform Plan\n\n");
      expect(title.fixed).toBe(true);
    });

    it("renders step issues before the body", () => {
      const report: StructuredReport = {
        kind: "structured",
        title: "Plan",
        issues: [
          {
            id: "validate",
            heading: "`validate` had warnings",
            isFailed: false,
            stdout: "warning output",
          },
        ],
        isApply: false,
        toolVersion: "1.5.0",
        formatVersion: "1.2",
        timestamp: null,
        summary: { actions: [], failures: [] },
        modules: [],
        outputs: [],
        driftModules: [],
      };
      const sections = renderReportSections(report);
      const ids = sections.map((s) => s.id);
      const issueIdx = ids.indexOf("issue-validate");
      const bodyIdx = ids.indexOf("report-body");
      expect(issueIdx).toBeGreaterThan(-1);
      expect(bodyIdx).toBeGreaterThan(issueIdx);
    });
  });

  describe("text-fallback report", () => {
    it("renders marker, title, issues, and body sections", () => {
      const report: TextFallbackReport = {
        kind: "text-fallback",
        title: "Terraform Plan",
        tool: undefined,
        fallbackReason: "show-plan-parse-error",
        issues: [
          {
            id: "show-plan",
            heading: "Plan output could not be parsed",
            isFailed: false,
            stdout: "raw output",
          },
        ],
        readErrors: [],
        steps: [],
        hasOutput: true,
        planContent: "Plan: 1 to add",
        workspace: "prod",
      };
      const sections = renderReportSections(report);
      const ids = sections.map((s) => s.id);
      expect(ids).toContain("marker");
      expect(ids).toContain("title");
      expect(ids).toContain("issue-show-plan");
      expect(ids).toContain("note");
      expect(ids).toContain("plan-output");
    });
  });

  describe("workflow report", () => {
    it("renders title and step table", () => {
      const report: WorkflowReport = {
        kind: "workflow",
        title: "Workflow Summary",
        steps: [
          { id: "init", outcome: "success" },
          { id: "plan", outcome: "success" },
        ],
      };
      const sections = renderReportSections(report);
      const ids = sections.map((s) => s.id);
      expect(ids).toContain("title");
      expect(ids).toContain("step-table");
      // No marker when workspace is not set
      expect(ids).not.toContain("marker");
    });
  });

  describe("error report", () => {
    it("renders title and message", () => {
      const report: ErrorReport = {
        kind: "error",
        title: "❌ Pipeline Error",
        message: "Steps context could not be parsed.",
      };
      const sections = renderReportSections(report);
      const ids = sections.map((s) => s.id);
      expect(ids).toContain("title");
      expect(ids).toContain("message");

      const title = sections.find((s) => s.id === "title")!;
      expect(title.full).toBe("## ❌ Pipeline Error\n\n");

      const message = sections.find((s) => s.id === "message")!;
      expect(message.full).toContain("Steps context could not be parsed.");
    });

    it("includes step statuses when present", () => {
      const report: ErrorReport = {
        kind: "error",
        title: "Error",
        message: "Failed.",
        steps: [{ id: "init", outcome: "failure" }],
      };
      const sections = renderReportSections(report);
      expect(sections.map((s) => s.id)).toContain("step-statuses");
    });
  });
});
