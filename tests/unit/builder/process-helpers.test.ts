import { describe, it, expect } from "vitest";
import {
  filterJsonlByAddresses,
  filterStepIssueStdout,
} from "../../../src/builder/process-helpers.js";
import type { Report } from "../../../src/model/report.js";
import type { StepIssue } from "../../../src/model/step-issue.js";

// ─── filterJsonlByAddresses ──────────────────────────────────────────────────

describe("filterJsonlByAddresses", () => {
  const failedAddresses = new Set([
    "module.foo.aws_instance.web",
    "module.foo.aws_s3_bucket.logs",
  ]);

  it("retains lines whose address is in the filter set", () => {
    const lines = [
      JSON.stringify({
        type: "apply_complete",
        hook: { resource: { addr: "module.foo.aws_instance.web" } },
      }),
      JSON.stringify({
        type: "apply_complete",
        hook: { resource: { addr: "module.bar.aws_instance.other" } },
      }),
    ].join("\n");

    const result = filterJsonlByAddresses(lines, failedAddresses);
    expect(result).toContain("aws_instance.web");
    expect(result).not.toContain("aws_instance.other");
  });

  it("retains lines with no resource address (version, change_summary)", () => {
    const lines = [
      JSON.stringify({ type: "version", tofu: "1.0.0" }),
      JSON.stringify({
        type: "change_summary",
        changes: { add: 1, change: 0, remove: 0 },
      }),
      JSON.stringify({
        type: "apply_complete",
        hook: { resource: { addr: "other.resource" } },
      }),
    ].join("\n");

    const result = filterJsonlByAddresses(lines, failedAddresses);
    expect(result).toContain('"version"');
    expect(result).toContain('"change_summary"');
    expect(result).not.toContain("other.resource");
  });

  it("filters planned_change messages by change.resource.addr", () => {
    const kept = JSON.stringify({
      type: "planned_change",
      change: { resource: { addr: "module.foo.aws_instance.web" } },
    });
    const dropped = JSON.stringify({
      type: "planned_change",
      change: { resource: { addr: "module.other.aws_instance.x" } },
    });
    const result = filterJsonlByAddresses(
      [kept, dropped].join("\n"),
      failedAddresses,
    );
    expect(result).toContain("aws_instance.web");
    expect(result).not.toContain("aws_instance.x");
  });

  it("filters diagnostic messages by diagnostic.address", () => {
    const kept = JSON.stringify({
      type: "diagnostic",
      diagnostic: { address: "module.foo.aws_instance.web", severity: "error" },
    });
    const dropped = JSON.stringify({
      type: "diagnostic",
      diagnostic: {
        address: "module.other.aws_instance.x",
        severity: "error",
      },
    });
    const result = filterJsonlByAddresses(
      [kept, dropped].join("\n"),
      failedAddresses,
    );
    expect(result).toContain("aws_instance.web");
    expect(result).not.toContain("aws_instance.x");
  });

  it("retains diagnostic messages with no address unconditionally", () => {
    const line = JSON.stringify({
      type: "diagnostic",
      diagnostic: { severity: "error", summary: "Provider error" },
    });
    const result = filterJsonlByAddresses(line, failedAddresses);
    expect(result).toContain("Provider error");
  });

  it("retains non-JSON lines as-is", () => {
    const result = filterJsonlByAddresses("not json at all", failedAddresses);
    expect(result).toBe("not json at all");
  });

  it("retains blank lines", () => {
    const result = filterJsonlByAddresses("line1\n\nline2", new Set(["x"]));
    expect(result).toBe("line1\n\nline2");
  });

  it("handles all hook-based apply message types", () => {
    const types = [
      "apply_start",
      "apply_progress",
      "apply_complete",
      "apply_errored",
      "refresh_start",
      "refresh_complete",
      "provision_start",
      "provision_progress",
      "provision_complete",
      "provision_errored",
    ];
    for (const type of types) {
      const kept = JSON.stringify({
        type,
        hook: { resource: { addr: "module.foo.aws_instance.web" } },
      });
      const dropped = JSON.stringify({
        type,
        hook: { resource: { addr: "unrelated.resource" } },
      });
      const result = filterJsonlByAddresses(
        [kept, dropped].join("\n"),
        failedAddresses,
      );
      expect(result).toContain("aws_instance.web");
      expect(result).not.toContain("unrelated.resource");
    }
  });
});

// ─── filterStepIssueStdout ───────────────────────────────────────────────────

function makeReport(issue: StepIssue): Report {
  return {
    title: "",
    issues: [issue],
    steps: [],
    warnings: [],
    rawStdout: [],
  };
}

describe("filterStepIssueStdout", () => {
  const addrDiag = {
    severity: "error" as const,
    summary: "failed",
    detail: "",
    address: "module.foo.aws_instance.web",
  };

  const noAddrDiag = {
    severity: "error" as const,
    summary: "provider error",
    detail: "",
  };

  const keptLine = JSON.stringify({
    type: "apply_complete",
    hook: { resource: { addr: "module.foo.aws_instance.web" } },
  });
  const droppedLine = JSON.stringify({
    type: "apply_complete",
    hook: { resource: { addr: "module.other.aws_instance.x" } },
  });

  it("filters stdout when all diagnostics have addresses", () => {
    const issue: StepIssue = {
      id: "apply",
      heading: "`apply` failed",
      isFailed: true,
      stdout: [keptLine, droppedLine].join("\n"),
    };
    const report = makeReport(issue);

    filterStepIssueStdout(report, "apply", [addrDiag]);

    expect(report.issues[0]?.stdout).toContain("aws_instance.web");
    expect(report.issues[0]?.stdout).not.toContain("aws_instance.x");
  });

  it("is a no-op when any diagnostic lacks an address", () => {
    const issue: StepIssue = {
      id: "apply",
      heading: "`apply` failed",
      isFailed: true,
      stdout: [keptLine, droppedLine].join("\n"),
    };
    const report = makeReport(issue);
    const originalStdout = issue.stdout;

    filterStepIssueStdout(report, "apply", [addrDiag, noAddrDiag]);

    expect(report.issues[0]?.stdout).toBe(originalStdout);
  });

  it("is a no-op when diagnostics array is empty", () => {
    const issue: StepIssue = {
      id: "apply",
      heading: "`apply` failed",
      isFailed: true,
      stdout: droppedLine,
    };
    const report = makeReport(issue);
    const originalStdout = issue.stdout;

    filterStepIssueStdout(report, "apply", []);

    expect(report.issues[0]?.stdout).toBe(originalStdout);
  });

  it("is a no-op when no issue with the given stepId exists", () => {
    const issue: StepIssue = {
      id: "plan",
      heading: "`plan` failed",
      isFailed: true,
      stdout: droppedLine,
    };
    const report = makeReport(issue);

    filterStepIssueStdout(report, "apply", [addrDiag]);

    expect(report.issues[0]?.stdout).toBe(droppedLine);
  });

  it("is a no-op when the issue has no stdout", () => {
    const issue: StepIssue = {
      id: "apply",
      heading: "`apply` failed",
      isFailed: true,
    };
    const report = makeReport(issue);

    filterStepIssueStdout(report, "apply", [addrDiag]);

    expect(report.issues[0]?.stdout).toBeUndefined();
  });

  it("preserves other StepIssue fields when filtering", () => {
    const issue: StepIssue = {
      id: "apply",
      heading: "`apply` failed",
      isFailed: true,
      exitCode: "1",
      stdoutTruncated: true,
      stderr: "some error",
      stdout: [keptLine, droppedLine].join("\n"),
    };
    const report = makeReport(issue);

    filterStepIssueStdout(report, "apply", [addrDiag]);

    const result = report.issues[0];
    expect(result?.exitCode).toBe("1");
    expect(result?.stdoutTruncated).toBe(true);
    expect(result?.stderr).toBe("some error");
  });
});
