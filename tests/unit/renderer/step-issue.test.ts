import { describe, it, expect } from "vitest";
import { renderStepIssue } from "../../../src/renderer/step-issue.js";
import type { StepIssue } from "../../../src/model/step-issue.js";

describe("renderStepIssue", () => {
  it("uses ❌ icon for a failed step", () => {
    const issue: StepIssue = {
      id: "plan",
      heading: "`plan` failed",
      isFailed: true,
      stdout: "some output",
    };
    const section = renderStepIssue(issue);
    expect(section.full).toContain("### ❌ `plan` failed");
    expect(section.compact).toContain("### ❌ `plan` failed");
    expect(section.id).toBe("issue-plan");
  });

  it("uses ⚠️ icon for a warning (non-failed) issue", () => {
    const issue: StepIssue = {
      id: "show-plan",
      heading: "Plan output could not be parsed",
      isFailed: false,
      stdout: "raw plan output",
    };
    const section = renderStepIssue(issue);
    expect(section.full).toContain("### ⚠️ Plan output could not be parsed");
    expect(section.compact).toContain("### ⚠️ Plan output could not be parsed");
  });

  it("renders diagnostic as a blockquote", () => {
    const issue: StepIssue = {
      id: "validate",
      heading: "`validate` failed",
      isFailed: true,
      diagnostic: "Configuration is invalid.",
      stdout: "error output",
    };
    const section = renderStepIssue(issue);
    expect(section.full).toContain("> Configuration is invalid.\n");
  });

  it("renders stdout in a collapsible details block", () => {
    const issue: StepIssue = {
      id: "plan",
      heading: "`plan` failed",
      isFailed: true,
      stdout: "Plan: 0 to add",
    };
    const section = renderStepIssue(issue);
    expect(section.full).toContain("<details open>");
    expect(section.full).toContain("<summary>stdout</summary>");
    expect(section.full).toContain("Plan: 0 to add");
  });

  it("appends truncation indicator to stdout when stdoutTruncated is true", () => {
    const issue: StepIssue = {
      id: "plan",
      heading: "`plan` failed",
      isFailed: true,
      stdout: "partial output",
      stdoutTruncated: true,
    };
    const section = renderStepIssue(issue);
    expect(section.full).toContain("… (truncated)");
  });

  it("renders stderr in a code block inside details", () => {
    const issue: StepIssue = {
      id: "init",
      heading: "`init` failed",
      isFailed: true,
      stderr: "Error: Failed to install provider",
    };
    const section = renderStepIssue(issue);
    expect(section.full).toContain("<summary>stderr</summary>");
    expect(section.full).toContain(
      "```\nError: Failed to install provider\n```",
    );
  });

  it("appends truncation indicator to stderr when stderrTruncated is true", () => {
    const issue: StepIssue = {
      id: "init",
      heading: "`init` failed",
      isFailed: true,
      stderr: "partial error",
      stderrTruncated: true,
    };
    const section = renderStepIssue(issue);
    expect(section.full).toContain("partial error\n… (truncated)");
  });

  it("shows stdoutError warning when stdout is not available", () => {
    const issue: StepIssue = {
      id: "plan",
      heading: "`plan` failed",
      isFailed: true,
      stdoutError: "file not found",
    };
    const section = renderStepIssue(issue);
    expect(section.full).toContain("⚠️ stdout not available: file not found");
  });

  it("shows stderrError warning when stderr is not available", () => {
    const issue: StepIssue = {
      id: "plan",
      heading: "`plan` failed",
      isFailed: true,
      stderrError: "permission denied",
    };
    const section = renderStepIssue(issue);
    expect(section.full).toContain(
      "⚠️ stderr not available: permission denied",
    );
  });

  it("renders both stdout and stderr when both are present", () => {
    const issue: StepIssue = {
      id: "apply",
      heading: "`apply` failed",
      isFailed: true,
      stdout: "stdout content",
      stderr: "stderr content",
    };
    const section = renderStepIssue(issue);
    expect(section.full).toContain("<summary>stdout</summary>");
    expect(section.full).toContain("<summary>stderr</summary>");
  });

  it("shows 'No output captured.' when nothing is available", () => {
    const issue: StepIssue = {
      id: "init",
      heading: "`init` failed",
      isFailed: true,
    };
    const section = renderStepIssue(issue);
    expect(section.full).toContain("No output captured.");
  });

  it("does not show 'No output captured.' when stdoutError is present", () => {
    const issue: StepIssue = {
      id: "init",
      heading: "`init` failed",
      isFailed: true,
      stdoutError: "read error",
    };
    const section = renderStepIssue(issue);
    expect(section.full).not.toContain("No output captured.");
  });
});
