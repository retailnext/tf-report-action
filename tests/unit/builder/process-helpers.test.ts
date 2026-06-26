import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildFocusedStepIssue,
  uiDiagnosticToModel,
  addScannerWarnings,
} from "../../../src/builder/process-helpers.js";
import type { ConcernSeed } from "../../../src/builder/causal-relevance.js";
import type { StepData, ReaderOptions } from "../../../src/steps/types.js";
import type { Report } from "../../../src/model/report.js";
import type { ScanResult } from "../../../src/jsonl-scanner/types.js";
import type { UIDiagnostic } from "../../../src/tfjson/machine-readable-ui.js";

const tempDir = mkdtempSync(join(tmpdir(), "process-helpers-test-"));

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const opts: ReaderOptions = {
  allowedDirs: [tempDir],
  maxFileSize: 1024 * 1024,
};

function writeFixture(name: string, content: string): string {
  const path = join(tempDir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

function jsonl(...objects: Record<string, unknown>[]): string {
  return objects.map((o) => JSON.stringify(o)).join("\n");
}

// ─── buildFocusedStepIssue ───────────────────────────────────────────────────

describe("buildFocusedStepIssue", () => {
  it("focuses stdout to concern-relevant lines when there is a concern", () => {
    const content = jsonl(
      { type: "version", tofu: "1.8.0" },
      {
        type: "refresh_start",
        hook: { resource: { addr: "null_resource.a" } },
      },
      {
        type: "refresh_start",
        hook: { resource: { addr: "null_resource.b" } },
      },
      { type: "change_summary", changes: { add: 0 } },
      {
        type: "diagnostic",
        diagnostic: { severity: "error", summary: "Invalid index", detail: "" },
      },
    );
    const path = writeFixture("focus-concern.jsonl", content);
    const step: StepData = {
      outcome: "failure",
      outputs: { stdout_file: path },
    };
    const seed: ConcernSeed = { seedAddrs: new Set(), hasConcern: true };

    const issue = buildFocusedStepIssue(step, "plan", opts, path, seed);
    expect(issue.isFailed).toBe(true);
    expect(issue.stdout).toContain("Invalid index");
    expect(issue.stdout).not.toContain("refresh_start");
    expect(issue.stdout).not.toContain("version");
    expect(issue.stdout).not.toContain("change_summary");
  });

  it("keeps hooks for a seeded resource", () => {
    const content = jsonl(
      { type: "refresh_start", hook: { resource: { addr: "aws_db.main" } } },
      { type: "refresh_start", hook: { resource: { addr: "aws_db.other" } } },
      {
        type: "diagnostic",
        diagnostic: {
          severity: "error",
          summary: "boom",
          detail: "",
          address: "aws_db.main",
        },
      },
    );
    const path = writeFixture("focus-seeded.jsonl", content);
    const step: StepData = {
      outcome: "failure",
      outputs: { stdout_file: path },
    };
    const seed: ConcernSeed = {
      seedAddrs: new Set(["aws_db.main"]),
      hasConcern: true,
    };

    const issue = buildFocusedStepIssue(step, "apply", opts, path, seed);
    expect(issue.stdout).toContain("aws_db.main");
    expect(issue.stdout).not.toContain("aws_db.other");
  });

  it("falls back to full bounded stdout when there is no concern", () => {
    const content = jsonl(
      {
        type: "refresh_start",
        hook: { resource: { addr: "null_resource.a" } },
      },
      {
        type: "refresh_start",
        hook: { resource: { addr: "null_resource.b" } },
      },
    );
    const path = writeFixture("focus-noconcern.jsonl", content);
    const step: StepData = {
      outcome: "failure",
      outputs: { stdout_file: path },
    };
    const seed: ConcernSeed = { seedAddrs: new Set(), hasConcern: false };

    const issue = buildFocusedStepIssue(step, "plan", opts, path, seed);
    // Nothing to scope to — the raw content is retained verbatim.
    expect(issue.stdout).toBe(content);
  });

  it("returns an issue without stdout when the emit scan fails", () => {
    const missing = join(tempDir, "does-not-exist.jsonl");
    const step: StepData = {
      outcome: "failure",
      outputs: { stdout_file: missing },
    };
    const seed: ConcernSeed = { seedAddrs: new Set(), hasConcern: true };

    const issue = buildFocusedStepIssue(step, "plan", opts, missing, seed);
    expect(issue.isFailed).toBe(true);
    expect(issue.stdout).toBeUndefined();
  });
});

// ─── uiDiagnosticToModel ─────────────────────────────────────────────────────

describe("uiDiagnosticToModel", () => {
  it("maps required fields and source", () => {
    const ui: UIDiagnostic = {
      severity: "error",
      summary: "broken",
      detail: "details here",
    };
    const model = uiDiagnosticToModel(ui, "validate");
    expect(model.severity).toBe("error");
    expect(model.summary).toBe("broken");
    expect(model.detail).toBe("details here");
    expect(model.source).toBe("validate");
    expect(model.address).toBeUndefined();
  });

  it("maps optional address, range and snippet when present", () => {
    const ui: UIDiagnostic = {
      severity: "warning",
      summary: "heads up",
      detail: "",
      address: "aws_instance.web",
      range: {
        filename: "main.tf",
        start: { line: 1, column: 1, byte: 0 },
        end: { line: 1, column: 2, byte: 1 },
      },
      snippet: {
        context: "",
        code: "x",
        start_line: 1,
        highlight_start_offset: 0,
        highlight_end_offset: 1,
        values: [],
      },
    };
    const model = uiDiagnosticToModel(ui, "plan");
    expect(model.address).toBe("aws_instance.web");
    expect(model.range?.filename).toBe("main.tf");
    expect(model.snippet?.code).toBe("x");
  });
});

// ─── addScannerWarnings ──────────────────────────────────────────────────────

describe("addScannerWarnings", () => {
  function emptyReport(): Report {
    return { warnings: [], issues: [], rawStdout: [] } as unknown as Report;
  }

  function scanWith(
    unparseableLines: number,
    unknownTypeLines: number,
  ): ScanResult {
    return {
      plannedChanges: [],
      applyStatuses: [],
      diagnostics: [],
      driftChanges: [],
      totalLines: 0,
      parsedLines: 0,
      unknownTypeLines,
      unparseableLines,
    };
  }

  it("adds no warnings when counters are zero", () => {
    const report = emptyReport();
    addScannerWarnings(report, scanWith(0, 0), "plan");
    expect(report.warnings).toHaveLength(0);
  });

  it("adds warnings for unparseable and unknown-type lines", () => {
    const report = emptyReport();
    addScannerWarnings(report, scanWith(3, 2), "apply");
    expect(report.warnings).toHaveLength(2);
  });
});
