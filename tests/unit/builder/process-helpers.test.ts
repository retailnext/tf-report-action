import { describe, it, expect } from "vitest";
import { focusStepIssueStdout } from "../../../src/builder/process-helpers.js";
import type { Report } from "../../../src/model/report.js";
import type { StepIssue } from "../../../src/model/step-issue.js";

// ─── focusStepIssueStdout ────────────────────────────────────────────────────

function makeReport(issue: StepIssue): Report {
  return {
    title: { status: "success", body: { kind: "no-changes" } },
    issues: [issue],
    steps: [],
    warnings: [],
    rawStdout: [],
  };
}

const errorDiag = JSON.stringify({
  type: "diagnostic",
  diagnostic: {
    severity: "error",
    summary: "failed",
    address: "module.foo.aws_instance.web",
  },
});
const relevantHook = JSON.stringify({
  type: "apply_complete",
  hook: { resource: { addr: "module.foo.aws_instance.web" } },
});
const unrelatedHook = JSON.stringify({
  type: "apply_complete",
  hook: { resource: { addr: "module.other.aws_instance.x" } },
});

describe("focusStepIssueStdout", () => {
  it("focuses stdout to lines relevant to the failure's concerns", () => {
    const issue: StepIssue = {
      id: "apply",
      reason: "failed",
      isFailed: true,
      stdout: [errorDiag, relevantHook, unrelatedHook].join("\n"),
    };
    const report = makeReport(issue);

    focusStepIssueStdout(report, "apply");

    expect(report.issues[0]?.stdout).toContain("aws_instance.web");
    expect(report.issues[0]?.stdout).not.toContain("aws_instance.x");
  });

  it("is a no-op when the step emitted no concern (keeps everything)", () => {
    const stdout = [unrelatedHook, relevantHook].join("\n");
    const issue: StepIssue = {
      id: "apply",
      reason: "failed",
      isFailed: true,
      stdout,
    };
    const report = makeReport(issue);

    focusStepIssueStdout(report, "apply");

    expect(report.issues[0]?.stdout).toBe(stdout);
  });

  it("is a no-op when no issue with the given stepId exists", () => {
    const issue: StepIssue = {
      id: "plan",
      reason: "failed",
      isFailed: true,
      stdout: [errorDiag, unrelatedHook].join("\n"),
    };
    const report = makeReport(issue);
    const original = issue.stdout;

    focusStepIssueStdout(report, "apply");

    expect(report.issues[0]?.stdout).toBe(original);
  });

  it("is a no-op when the issue has no stdout", () => {
    const issue: StepIssue = {
      id: "apply",
      reason: "failed",
      isFailed: true,
    };
    const report = makeReport(issue);

    focusStepIssueStdout(report, "apply");

    expect(report.issues[0]?.stdout).toBeUndefined();
  });

  it("preserves other StepIssue fields when focusing", () => {
    const issue: StepIssue = {
      id: "apply",
      reason: "failed",
      isFailed: true,
      exitCode: "1",
      stderr: "some error",
      stdout: [errorDiag, relevantHook, unrelatedHook].join("\n"),
    };
    const report = makeReport(issue);

    focusStepIssueStdout(report, "apply");

    const result = report.issues[0];
    expect(result?.exitCode).toBe("1");
    expect(result?.stderr).toBe("some error");
    expect(result?.stdout).not.toContain("aws_instance.x");
  });
});
