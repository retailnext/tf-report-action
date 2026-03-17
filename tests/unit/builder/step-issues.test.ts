import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildStepIssue } from "../../../src/builder/step-issues.js";
import type { StepData, ReaderOptions } from "../../../src/steps/types.js";

const tempDir = mkdtempSync(join(tmpdir(), "step-issues-test-"));

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeFixture(name: string, content: string): string {
  const path = join(tempDir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

const opts: ReaderOptions = {
  allowedDirs: [tempDir],
  maxFileSize: 1024,
  maxDisplayRead: 64,
};

describe("buildStepIssue", () => {
  it("builds an issue for a failed step with stdout and stderr", () => {
    const stdoutPath = writeFixture("fail-stdout.txt", "command output");
    const stderrPath = writeFixture(
      "fail-stderr.txt",
      "Error: something broke",
    );
    const step: StepData = {
      outcome: "failure",
      outputs: { stdout_file: stdoutPath, stderr_file: stderrPath },
    };

    const issue = buildStepIssue(step, "init", opts);
    expect(issue.id).toBe("init");
    expect(issue.heading).toBe("`init` failed");
    expect(issue.isFailed).toBe(true);
    expect(issue.stdout).toBe("command output");
    expect(issue.stderr).toBe("Error: something broke");
    expect(issue.diagnostic).toBeUndefined();
  });

  it("builds an issue for a successful step with a diagnostic message", () => {
    const stdoutPath = writeFixture("diag-stdout.txt", "plan output");
    const step: StepData = {
      outcome: "success",
      outputs: { stdout_file: stdoutPath },
    };

    const issue = buildStepIssue(
      step,
      "show-plan",
      opts,
      "Plan output could not be parsed",
    );
    expect(issue.id).toBe("show-plan");
    expect(issue.heading).toBe("`show-plan`: output could not be parsed");
    expect(issue.isFailed).toBe(false);
    expect(issue.diagnostic).toBe("Plan output could not be parsed");
    expect(issue.stdout).toBe("plan output");
  });

  it("builds an issue when no output files are available", () => {
    const step: StepData = { outcome: "failure" };

    const issue = buildStepIssue(step, "validate", opts);
    expect(issue.id).toBe("validate");
    expect(issue.heading).toBe("`validate` failed");
    expect(issue.isFailed).toBe(true);
    expect(issue.stdout).toBeUndefined();
    expect(issue.stderr).toBeUndefined();
  });

  it("uses generic heading for non-failure, non-diagnostic step", () => {
    const step: StepData = { outcome: "cancelled" };

    const issue = buildStepIssue(step, "plan", opts);
    expect(issue.heading).toBe("`plan` cancelled");
    expect(issue.isFailed).toBe(false);
  });

  it("marks truncated stdout when content exceeds display limit", () => {
    const bigContent = "x".repeat(128);
    const stdoutPath = writeFixture("big-stdout.txt", bigContent);
    const step: StepData = {
      outcome: "failure",
      outputs: { stdout_file: stdoutPath },
    };

    const issue = buildStepIssue(step, "plan", opts);
    expect(issue.stdout).toBe("x".repeat(64));
    expect(issue.stdoutTruncated).toBe(true);
  });

  it("marks truncated stderr when content exceeds display limit", () => {
    const bigContent = "y".repeat(128);
    const stderrPath = writeFixture("big-stderr.txt", bigContent);
    const step: StepData = {
      outcome: "failure",
      outputs: { stderr_file: stderrPath },
    };

    const issue = buildStepIssue(step, "apply", opts);
    expect(issue.stderr).toBe("y".repeat(64));
    expect(issue.stderrTruncated).toBe(true);
  });

  it("reports read errors when files are outside allowed dirs", () => {
    const step: StepData = {
      outcome: "failure",
      outputs: {
        stdout_file: "/not/allowed/stdout.txt",
        stderr_file: "/not/allowed/stderr.txt",
      },
    };

    const issue = buildStepIssue(step, "init", opts);
    expect(issue.stdout).toBeUndefined();
    expect(issue.stderr).toBeUndefined();
    expect(issue.stdoutError).toBeDefined();
    expect(issue.stderrError).toBeDefined();
  });

  it("omits diagnostic property when not provided", () => {
    const step: StepData = { outcome: "failure" };
    const issue = buildStepIssue(step, "init", opts);
    expect("diagnostic" in issue).toBe(false);
  });

  it("omits truncated flags when content fits within display limit", () => {
    const stdoutPath = writeFixture("small-stdout.txt", "ok");
    const stderrPath = writeFixture("small-stderr.txt", "warn");
    const step: StepData = {
      outcome: "failure",
      outputs: { stdout_file: stdoutPath, stderr_file: stderrPath },
    };

    const issue = buildStepIssue(step, "apply", opts);
    expect(issue.stdout).toBe("ok");
    expect(issue.stderr).toBe("warn");
    expect("stdoutTruncated" in issue).toBe(false);
    expect("stderrTruncated" in issue).toBe(false);
  });
});
