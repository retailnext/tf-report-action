import { describe, expect, it } from "vitest";
import type { ReportElement } from "../../../src/renderable/types.js";
import { StepIssueElement } from "../../../src/elements/step-issue.js";
import type { StepIssue } from "../../../src/model/step-issue.js";

function assertElementSizeInvariant(el: ReportElement, label?: string): void {
  for (const fmt of ["markdown", "html"] as const) {
    for (let lvl = 0; lvl < el.levels; lvl++) {
      const rendered = el.render(fmt, lvl);
      expect(
        el.size(fmt, lvl),
        `${label ?? el.id} size(${fmt}, ${String(lvl)})`,
      ).toBe(rendered.length);
    }
  }
}

const failedIssue: StepIssue = {
  id: "plan",
  heading: "`plan` failed",
  isFailed: true,
  diagnostic: "Plan exited with error",
  stdout: "Error: resource not found",
  stderr: "stderr output here",
  exitCode: "1",
};

const warningIssue: StepIssue = {
  id: "show-plan",
  heading: "`show-plan` warning",
  isFailed: false,
  diagnostic: "Plan output could not be parsed",
};

describe("StepIssueElement", () => {
  it("has correct metadata", () => {
    const el = new StepIssueElement(failedIssue);
    expect(el.id).toBe("issue-plan");
    expect(el.fixed).toBe(false);
    expect(el.levels).toBe(2);
  });

  it("derives id from issue.id", () => {
    const el = new StepIssueElement(warningIssue);
    expect(el.id).toBe("issue-show-plan");
  });

  it("level 0 renders heading only with failure icon in markdown", () => {
    const el = new StepIssueElement(failedIssue);
    const md = el.render("markdown", 0);
    expect(md).toContain("❌");
    expect(md).toContain("`plan` failed");
    // Level 0 should not contain stdout/stderr details
    expect(md).not.toContain("stdout");
    expect(md).not.toContain("Exit code");
  });

  it("level 0 renders heading only with warning icon in markdown", () => {
    const el = new StepIssueElement(warningIssue);
    const md = el.render("markdown", 0);
    expect(md).toContain("⚠️");
    expect(md).toContain("`show-plan` warning");
  });

  it("level 1 renders full details with exit code", () => {
    const el = new StepIssueElement(failedIssue);
    const md = el.render("markdown", 1);
    expect(md).toContain("`plan` failed");
    expect(md).toContain("Exit code: `1`");
  });

  it("level 1 renders diagnostic as blockquote", () => {
    const el = new StepIssueElement(failedIssue);
    const md = el.render("markdown", 1);
    expect(md).toContain("> Plan exited with error");
  });

  it("level 1 renders stdout in collapsible details", () => {
    const el = new StepIssueElement(failedIssue);
    const md = el.render("markdown", 1);
    expect(md).toContain("<summary>stdout</summary>");
    expect(md).toContain("Error: resource not found");
  });

  it("level 1 renders stderr in collapsible details", () => {
    const el = new StepIssueElement(failedIssue);
    const md = el.render("markdown", 1);
    expect(md).toContain("<summary>stderr</summary>");
    expect(md).toContain("stderr output here");
  });

  it("shows 'No output captured.' when no stdout/stderr/errors", () => {
    const issue: StepIssue = {
      id: "init",
      heading: "`init` failed",
      isFailed: true,
    };
    const el = new StepIssueElement(issue);
    const md = el.render("markdown", 1);
    expect(md).toContain("No output captured.");
  });

  it("renders stdoutError as warning blockquote", () => {
    const issue: StepIssue = {
      id: "plan",
      heading: "`plan` failed",
      isFailed: true,
      stdoutError: "File not found",
    };
    const el = new StepIssueElement(issue);
    const md = el.render("markdown", 1);
    expect(md).toContain("⚠️");
    expect(md).toContain("stdout not available: File not found");
  });

  it("renders stderrError as warning blockquote", () => {
    const issue: StepIssue = {
      id: "plan",
      heading: "`plan` failed",
      isFailed: true,
      stderrError: "Permission denied",
    };
    const el = new StepIssueElement(issue);
    const md = el.render("markdown", 1);
    expect(md).toContain("stderr not available: Permission denied");
  });

  it("renders exit code in HTML format", () => {
    const el = new StepIssueElement(failedIssue);
    const html = el.render("html", 1);
    expect(html).toContain("<code>1</code>");
    expect(html).toContain("Exit code");
  });

  it("renders heading in HTML format", () => {
    const el = new StepIssueElement(failedIssue);
    const html = el.render("html", 0);
    expect(html).toContain("<h3>");
    expect(html).toContain("❌");
  });

  it("satisfies the size invariant for failed issue with all fields", () => {
    assertElementSizeInvariant(
      new StepIssueElement(failedIssue),
      "failed-full",
    );
  });

  it("satisfies the size invariant for warning issue", () => {
    assertElementSizeInvariant(new StepIssueElement(warningIssue), "warning");
  });

  it("satisfies the size invariant for issue with no output", () => {
    const issue: StepIssue = {
      id: "init",
      heading: "`init` failed",
      isFailed: true,
    };
    assertElementSizeInvariant(new StepIssueElement(issue), "no-output");
  });

  it("satisfies the size invariant for issue with read errors", () => {
    const issue: StepIssue = {
      id: "plan",
      heading: "`plan` failed",
      isFailed: true,
      stdoutError: "File not found",
      stderrError: "Permission denied",
    };
    assertElementSizeInvariant(new StepIssueElement(issue), "read-errors");
  });
});
