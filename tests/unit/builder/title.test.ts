import { describe, it, expect } from "vitest";
import {
  buildTitle,
  buildPlanCounts,
  buildApplyCounts,
  buildFailureCounts,
} from "../../../src/builder/title.js";
import type { Report } from "../../../src/model/report.js";
import type {
  Summary,
  SummaryActionGroup,
} from "../../../src/model/summary.js";
import type { OutputChange } from "../../../src/model/output.js";

function makeSummary(
  actions: SummaryActionGroup[] = [],
  failures: SummaryActionGroup[] = [],
): Summary {
  return { actions, failures };
}

function makeActionGroup(action: string, total: number): SummaryActionGroup {
  return {
    action: action as SummaryActionGroup["action"],
    resourceTypes: [{ type: "null_resource", count: total }],
    total,
  };
}

function makeOutputs(count: number): OutputChange[] {
  return Array.from({ length: count }, (_unused, i) => ({
    name: `output_${String(i)}`,
    action: "create",
    before: null,
    after: "value",
    isSensitive: false,
    isLarge: false,
    isKnownAfterApply: false,
  }));
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    title: { status: "success", body: { kind: "no-changes" } },
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: [],
    ...overrides,
  };
}

describe("buildTitle", () => {
  it("returns plan title with create counts", () => {
    const report = makeReport({
      summary: makeSummary([makeActionGroup("create", 3)]),
      operation: "plan",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.body).toEqual({
      kind: "summary",
      operation: "plan",
      counts: [{ action: "create", count: 3 }],
      failures: [],
      failureTotal: 0,
      outputChanges: 0,
      hasStepFailure: false,
    });
  });

  it("returns plan title with multiple action counts", () => {
    const report = makeReport({
      summary: makeSummary([
        makeActionGroup("create", 2),
        makeActionGroup("update", 1),
        makeActionGroup("delete", 3),
      ]),
      operation: "plan",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.body).toEqual({
      kind: "summary",
      operation: "plan",
      counts: [
        { action: "create", count: 2 },
        { action: "update", count: 1 },
        { action: "delete", count: 3 },
      ],
      failures: [],
      failureTotal: 0,
      outputChanges: 0,
      hasStepFailure: false,
    });
  });

  it("returns 'No Changes' when no actions and no failures", () => {
    const report = makeReport({
      summary: makeSummary(),
      operation: "plan",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.body).toEqual({ kind: "no-changes" });
  });

  it("returns plan summary (not No Changes) when only outputs change", () => {
    const report = makeReport({
      summary: makeSummary(),
      operation: "plan",
      outputs: makeOutputs(3),
    });
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.body).toEqual({
      kind: "summary",
      operation: "plan",
      counts: [],
      failures: [],
      failureTotal: 0,
      outputChanges: 3,
      hasStepFailure: false,
    });
  });

  it("includes output count alongside plan resource counts", () => {
    const report = makeReport({
      summary: makeSummary([makeActionGroup("create", 2)]),
      operation: "plan",
      outputs: makeOutputs(1),
    });
    const result = buildTitle(report);
    expect(result.body).toEqual({
      kind: "summary",
      operation: "plan",
      counts: [{ action: "create", count: 2 }],
      failures: [],
      failureTotal: 0,
      outputChanges: 1,
      hasStepFailure: false,
    });
  });

  it("returns apply summary (not Apply Complete) when only outputs change", () => {
    const report = makeReport({
      summary: makeSummary(),
      operation: "apply",
      outputs: makeOutputs(2),
    });
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.body).toEqual({
      kind: "summary",
      operation: "apply",
      counts: [],
      failures: [],
      failureTotal: 0,
      outputChanges: 2,
      hasStepFailure: false,
    });
  });

  it("includes output count alongside apply resource counts", () => {
    const report = makeReport({
      summary: makeSummary([makeActionGroup("create", 1)]),
      operation: "apply",
      outputs: makeOutputs(4),
    });
    const result = buildTitle(report);
    expect(result.body).toEqual({
      kind: "summary",
      operation: "apply",
      counts: [{ action: "create", count: 1 }],
      failures: [],
      failureTotal: 0,
      outputChanges: 4,
      hasStepFailure: false,
    });
  });

  it("returns 'Plan Failed' when summary has failures", () => {
    const report = makeReport({
      summary: makeSummary([], [makeActionGroup("create", 1)]),
      operation: "plan",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("failure");
    expect(result.body).toEqual({
      kind: "operation-failed",
      operation: "plan",
    });
  });

  it("returns 'Plan Failed' when plan step has failure", () => {
    const report = makeReport({
      summary: makeSummary([makeActionGroup("create", 2)]),
      operation: "plan",
      steps: [{ id: "plan", outcome: "failure" }],
    });
    const result = buildTitle(report);
    expect(result.status).toBe("failure");
    expect(result.body).toEqual({
      kind: "operation-failed",
      operation: "plan",
    });
  });

  it("includes workspace prefix when workspace is provided", () => {
    const report = makeReport({
      summary: makeSummary([makeActionGroup("create", 1)]),
      operation: "plan",
      workspace: "staging",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.workspace).toBe("staging");
    expect(result.body).toEqual({
      kind: "summary",
      operation: "plan",
      counts: [{ action: "create", count: 1 }],
      failures: [],
      failureTotal: 0,
      outputChanges: 0,
      hasStepFailure: false,
    });
  });

  it("includes workspace prefix in No Changes title", () => {
    const report = makeReport({
      summary: makeSummary(),
      operation: "plan",
      workspace: "prod",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.workspace).toBe("prod");
    expect(result.body).toEqual({ kind: "no-changes" });
  });

  it("returns apply title with successful counts", () => {
    const report = makeReport({
      summary: makeSummary([
        makeActionGroup("create", 1),
        makeActionGroup("update", 2),
      ]),
      operation: "apply",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.body).toEqual({
      kind: "summary",
      operation: "apply",
      counts: [
        { action: "create", count: 1 },
        { action: "update", count: 2 },
      ],
      failures: [],
      failureTotal: 0,
      outputChanges: 0,
      hasStepFailure: false,
    });
  });

  it("returns 'Apply Complete' when apply has no actions", () => {
    const report = makeReport({
      summary: makeSummary(),
      operation: "apply",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.body).toEqual({
      kind: "summary",
      operation: "apply",
      counts: [],
      failures: [],
      failureTotal: 0,
      outputChanges: 0,
      hasStepFailure: false,
    });
  });

  it("returns 'Apply Failed' with failure and success counts", () => {
    const report = makeReport({
      summary: makeSummary(
        [makeActionGroup("create", 1)],
        [makeActionGroup("create", 2)],
      ),
      operation: "apply",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("failure");
    expect(result.body).toEqual({
      kind: "summary",
      operation: "apply",
      counts: [{ action: "create", count: 1 }],
      failures: [{ action: "failed", count: 2 }],
      failureTotal: 2,
      outputChanges: 0,
      hasStepFailure: false,
    });
  });

  it("includes workspace prefix in apply titles", () => {
    const report = makeReport({
      summary: makeSummary([makeActionGroup("delete", 1)]),
      operation: "apply",
      workspace: "prod",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.workspace).toBe("prod");
    expect(result.body).toEqual({
      kind: "summary",
      operation: "apply",
      counts: [{ action: "delete", count: 1 }],
      failures: [],
      failureTotal: 0,
      outputChanges: 0,
      hasStepFailure: false,
    });
  });

  it("returns error title when error is set", () => {
    const report = makeReport({ error: "something broke" });
    const result = buildTitle(report);
    expect(result.status).toBe("failure");
    expect(result.body).toEqual({ kind: "error" });
  });

  it("returns error title with workspace", () => {
    const report = makeReport({ error: "something broke", workspace: "dev" });
    const result = buildTitle(report);
    expect(result.status).toBe("failure");
    expect(result.workspace).toBe("dev");
    expect(result.body).toEqual({ kind: "error" });
  });

  it("returns 'All Steps Skipped' when all steps are skipped", () => {
    const report = makeReport({
      steps: [
        { id: "init", outcome: "skipped" },
        { id: "plan", outcome: "skipped" },
      ],
    });
    const result = buildTitle(report);
    expect(result.status).toBe("warning");
    expect(result.body).toEqual({ kind: "all-skipped" });
  });

  it("returns 'Plan Skipped' when operationOutcome is skipped and operation is plan", () => {
    const report = makeReport({
      operation: "plan",
      operationOutcome: "skipped",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("warning");
    expect(result.body).toEqual({
      kind: "operation-skipped",
      operation: "plan",
    });
  });

  it("returns 'Apply Skipped' when operationOutcome is skipped and operation is apply", () => {
    const report = makeReport({
      operation: "apply",
      operationOutcome: "skipped",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("warning");
    expect(result.body).toEqual({
      kind: "operation-skipped",
      operation: "apply",
    });
  });

  it("returns 'Destroy Skipped' when operationOutcome is skipped and operation is destroy", () => {
    const report = makeReport({
      operation: "destroy",
      operationOutcome: "skipped",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("warning");
    expect(result.body).toEqual({
      kind: "operation-skipped",
      operation: "destroy",
    });
  });

  it("includes workspace prefix in 'Plan Skipped' title", () => {
    const report = makeReport({
      operation: "plan",
      operationOutcome: "skipped",
      workspace: "tf",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("warning");
    expect(result.workspace).toBe("tf");
    expect(result.body).toEqual({
      kind: "operation-skipped",
      operation: "plan",
    });
  });

  it("does not skip title when operationOutcome is success", () => {
    const report = makeReport({
      operation: "plan",
      operationOutcome: "success",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.body).toEqual({ kind: "succeeded", operation: "plan" });
  });

  it("returns 'Succeeded' when no data is available", () => {
    const report = makeReport();
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.body).toEqual({ kind: "succeeded" });
  });

  it("returns 'Plan Succeeded' when operation is set but no summary", () => {
    const report = makeReport({ operation: "plan" });
    const result = buildTitle(report);
    expect(result.status).toBe("success");
    expect(result.body).toEqual({ kind: "succeeded", operation: "plan" });
  });

  it("returns 'Failed' when non-IaC step failed and no summary", () => {
    const report = makeReport({
      steps: [{ id: "custom-step", outcome: "failure" }],
    });
    const result = buildTitle(report);
    expect(result.status).toBe("failure");
    expect(result.body).toEqual({ kind: "step-failed", stepId: "custom-step" });
  });

  it("returns 'Failed' when multiple non-IaC steps failed", () => {
    const report = makeReport({
      steps: [
        { id: "step-a", outcome: "failure" },
        { id: "step-b", outcome: "failure" },
      ],
    });
    const result = buildTitle(report);
    expect(result.status).toBe("failure");
    expect(result.body).toEqual({ kind: "generic-failed" });
  });

  it("returns IaC failure title when plan step fails", () => {
    const report = makeReport({
      steps: [{ id: "plan", outcome: "failure" }],
      operation: "plan",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("failure");
    expect(result.body).toEqual({
      kind: "operation-failed",
      operation: "plan",
    });
  });

  it("returns IaC failure title when apply step fails", () => {
    const report = makeReport({
      steps: [{ id: "apply", outcome: "failure" }],
      operation: "apply",
    });
    const result = buildTitle(report);
    expect(result.status).toBe("failure");
    expect(result.body).toEqual({
      kind: "operation-failed",
      operation: "apply",
    });
  });
});

describe("buildPlanCounts", () => {
  it("returns empty array for empty actions", () => {
    const summary = makeSummary();
    expect(buildPlanCounts(summary)).toEqual([]);
  });

  it("maps create action", () => {
    const summary = makeSummary([makeActionGroup("create", 3)]);
    expect(buildPlanCounts(summary)).toEqual([{ action: "create", count: 3 }]);
  });

  it("maps update action", () => {
    const summary = makeSummary([makeActionGroup("update", 1)]);
    expect(buildPlanCounts(summary)).toEqual([{ action: "update", count: 1 }]);
  });

  it("maps delete action", () => {
    const summary = makeSummary([makeActionGroup("delete", 5)]);
    expect(buildPlanCounts(summary)).toEqual([{ action: "delete", count: 5 }]);
  });

  it("maps replace, import, move, and forget", () => {
    const summary = makeSummary([
      makeActionGroup("replace", 1),
      makeActionGroup("import", 2),
      makeActionGroup("move", 1),
      makeActionGroup("forget", 1),
    ]);
    expect(buildPlanCounts(summary)).toEqual([
      { action: "replace", count: 1 },
      { action: "import", count: 2 },
      { action: "move", count: 1 },
      { action: "forget", count: 1 },
    ]);
  });

  it("combines counts for duplicate action labels", () => {
    // Two groups with same action → their totals merge
    const summary = makeSummary([
      makeActionGroup("create", 2),
      makeActionGroup("create", 3),
    ]);
    expect(buildPlanCounts(summary)).toEqual([{ action: "create", count: 5 }]);
  });
});

describe("buildApplyCounts", () => {
  it("returns empty array for empty actions", () => {
    const summary = makeSummary();
    expect(buildApplyCounts(summary)).toEqual([]);
  });

  it("maps create action", () => {
    const summary = makeSummary([makeActionGroup("create", 2)]);
    expect(buildApplyCounts(summary)).toEqual([{ action: "create", count: 2 }]);
  });

  it("maps update action", () => {
    const summary = makeSummary([makeActionGroup("update", 1)]);
    expect(buildApplyCounts(summary)).toEqual([{ action: "update", count: 1 }]);
  });

  it("maps delete action", () => {
    const summary = makeSummary([makeActionGroup("delete", 3)]);
    expect(buildApplyCounts(summary)).toEqual([{ action: "delete", count: 3 }]);
  });

  it("maps replace, import, move, and forget", () => {
    const summary = makeSummary([
      makeActionGroup("replace", 1),
      makeActionGroup("import", 2),
      makeActionGroup("move", 1),
      makeActionGroup("forget", 1),
    ]);
    expect(buildApplyCounts(summary)).toEqual([
      { action: "replace", count: 1 },
      { action: "import", count: 2 },
      { action: "move", count: 1 },
      { action: "forget", count: 1 },
    ]);
  });
});

describe("buildFailureCounts", () => {
  it("returns empty array when no failures", () => {
    const summary = makeSummary([], []);
    expect(buildFailureCounts(summary)).toEqual([]);
  });

  it("returns total failed count", () => {
    const summary = makeSummary(
      [],
      [makeActionGroup("create", 2), makeActionGroup("update", 1)],
    );
    expect(buildFailureCounts(summary)).toEqual([
      { action: "failed", count: 3 },
    ]);
  });
});
