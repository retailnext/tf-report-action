import { describe, it, expect } from "vitest";
import { renderReportSections } from "../../../src/renderer/report-sections.js";
import type { Report } from "../../../src/model/report.js";

describe("renderReportSections", () => {
  describe("structured report", () => {
    it("renders marker, title, and body for a structured report", () => {
      const report: Report = {
        title: "Terraform Plan",
        issues: [],
        steps: [],
        warnings: [],
        rawStdout: [],
        toolVersion: "1.5.0",
        formatVersion: "1.2",
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
      expect(ids).toContain("summary");

      const marker = sections.find((s) => s.id === "marker")!;
      expect(marker.full).toContain("staging");
      expect(marker.fixed).toBe(true);

      const title = sections.find((s) => s.id === "title")!;
      expect(title.full).toBe("## Terraform Plan\n\n");
      expect(title.fixed).toBe(true);
    });

    it("renders step issues before the body", () => {
      const report: Report = {
        title: "Plan",
        issues: [
          {
            id: "validate",
            heading: "`validate` had warnings",
            isFailed: false,
            stdout: "warning output",
          },
        ],
        steps: [],
        warnings: [],
        rawStdout: [],
        toolVersion: "1.5.0",
        formatVersion: "1.2",
        summary: { actions: [], failures: [] },
        modules: [],
        outputs: [],
        driftModules: [],
      };
      const sections = renderReportSections(report);
      const ids = sections.map((s) => s.id);
      const issueIdx = ids.indexOf("issue-validate");
      const summaryIdx = ids.indexOf("summary");
      expect(issueIdx).toBeGreaterThan(-1);
      expect(summaryIdx).toBeGreaterThan(issueIdx);
    });
  });

  describe("text-fallback report", () => {
    it("renders marker, title, issues, and body sections", () => {
      const report: Report = {
        title: "Terraform Plan",
        issues: [
          {
            id: "show-plan",
            heading: "Plan output could not be parsed",
            isFailed: false,
            stdout: "raw output",
          },
        ],
        steps: [],
        warnings: [],
        rawStdout: [
          {
            stepId: "plan",
            label: "Plan Output",
            content: "Plan: 1 to add",
            truncated: false,
          },
        ],
        workspace: "prod",
      };
      const sections = renderReportSections(report);
      const ids = sections.map((s) => s.id);
      expect(ids).toContain("marker");
      expect(ids).toContain("title");
      expect(ids).toContain("issue-show-plan");
      expect(ids).toContain("raw-plan");
    });
  });

  describe("workflow report", () => {
    it("renders title and step table", () => {
      const report: Report = {
        title: "Workflow Summary",
        issues: [],
        steps: [
          { id: "init", outcome: "success" },
          { id: "plan", outcome: "success" },
        ],
        warnings: [],
        rawStdout: [],
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
      const report: Report = {
        title: "❌ Pipeline Error",
        issues: [],
        steps: [],
        warnings: [],
        rawStdout: [],
        error: "Steps context could not be parsed.",
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
      const report: Report = {
        title: "Error",
        issues: [],
        steps: [{ id: "init", outcome: "failure" }],
        warnings: [],
        rawStdout: [],
        error: "Failed.",
      };
      const sections = renderReportSections(report);
      expect(sections.map((s) => s.id)).toContain("step-statuses");
    });
  });
});
