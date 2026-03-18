import { describe, it, expect } from "vitest";
import {
  buildTitle,
  buildPlanCountParts,
  buildApplyCountParts,
  buildFailureCountParts,
} from "../../../src/builder/title.js";
import type { Report } from "../../../src/model/report.js";
import type {
  Summary,
  SummaryActionGroup,
} from "../../../src/model/summary.js";

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

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    title: "",
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
    expect(buildTitle(report)).toBe("✅ Plan: 3 to add");
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
    expect(buildTitle(report)).toBe(
      "✅ Plan: 2 to add, 1 to change, 3 to destroy",
    );
  });

  it("returns 'No Changes' when no actions and no failures", () => {
    const report = makeReport({
      summary: makeSummary(),
      operation: "plan",
    });
    expect(buildTitle(report)).toBe("✅ No Changes");
  });

  it("returns 'Plan Failed' when summary has failures", () => {
    const report = makeReport({
      summary: makeSummary([], [makeActionGroup("create", 1)]),
      operation: "plan",
    });
    expect(buildTitle(report)).toBe("❌ Plan Failed");
  });

  it("returns 'Plan Failed' when plan step has failure", () => {
    const report = makeReport({
      summary: makeSummary([makeActionGroup("create", 2)]),
      operation: "plan",
      steps: [{ id: "plan", outcome: "failure" }],
    });
    expect(buildTitle(report)).toBe("❌ Plan Failed");
  });

  it("includes workspace prefix when workspace is provided", () => {
    const report = makeReport({
      summary: makeSummary([makeActionGroup("create", 1)]),
      operation: "plan",
      workspace: "staging",
    });
    expect(buildTitle(report)).toBe("✅ `staging` Plan: 1 to add");
  });

  it("includes workspace prefix in No Changes title", () => {
    const report = makeReport({
      summary: makeSummary(),
      operation: "plan",
      workspace: "prod",
    });
    expect(buildTitle(report)).toBe("✅ `prod` No Changes");
  });

  it("returns apply title with successful counts", () => {
    const report = makeReport({
      summary: makeSummary([
        makeActionGroup("create", 1),
        makeActionGroup("update", 2),
      ]),
      operation: "apply",
    });
    expect(buildTitle(report)).toBe("✅ Apply: 1 added, 2 changed");
  });

  it("returns 'Apply Complete' when apply has no actions", () => {
    const report = makeReport({
      summary: makeSummary(),
      operation: "apply",
    });
    expect(buildTitle(report)).toBe("✅ Apply Complete");
  });

  it("returns 'Apply Failed' with failure and success counts", () => {
    const report = makeReport({
      summary: makeSummary(
        [makeActionGroup("create", 1)],
        [makeActionGroup("create", 2)],
      ),
      operation: "apply",
    });
    expect(buildTitle(report)).toBe("❌ Apply Failed: 2 failed, 1 added");
  });

  it("includes workspace prefix in apply titles", () => {
    const report = makeReport({
      summary: makeSummary([makeActionGroup("delete", 1)]),
      operation: "apply",
      workspace: "prod",
    });
    expect(buildTitle(report)).toBe("✅ `prod` Apply: 1 destroyed");
  });

  it("returns error title when error is set", () => {
    const report = makeReport({ error: "something broke" });
    expect(buildTitle(report)).toBe("❌ Report Generation Failed");
  });

  it("returns error title with workspace", () => {
    const report = makeReport({ error: "something broke", workspace: "dev" });
    expect(buildTitle(report)).toBe("❌ `dev` Report Generation Failed");
  });

  it("returns 'All Steps Skipped' when all steps are skipped", () => {
    const report = makeReport({
      steps: [
        { id: "init", outcome: "skipped" },
        { id: "plan", outcome: "skipped" },
      ],
    });
    expect(buildTitle(report)).toBe("⚠️ All Steps Skipped");
  });

  it("returns 'Succeeded' when no data is available", () => {
    const report = makeReport();
    expect(buildTitle(report)).toBe("✅ Succeeded");
  });

  it("returns 'Plan Succeeded' when operation is set but no summary", () => {
    const report = makeReport({ operation: "plan" });
    expect(buildTitle(report)).toBe("✅ Plan Succeeded");
  });

  it("returns 'Failed' when non-IaC step failed and no summary", () => {
    const report = makeReport({
      steps: [{ id: "custom-step", outcome: "failure" }],
    });
    expect(buildTitle(report)).toBe("❌ `custom-step` Failed");
  });

  it("returns 'Failed' when multiple non-IaC steps failed", () => {
    const report = makeReport({
      steps: [
        { id: "step-a", outcome: "failure" },
        { id: "step-b", outcome: "failure" },
      ],
    });
    expect(buildTitle(report)).toBe("❌ Failed");
  });

  it("returns IaC failure title when plan step fails", () => {
    const report = makeReport({
      steps: [{ id: "plan", outcome: "failure" }],
      operation: "plan",
    });
    expect(buildTitle(report)).toBe("❌ Plan Failed");
  });

  it("returns IaC failure title when apply step fails", () => {
    const report = makeReport({
      steps: [{ id: "apply", outcome: "failure" }],
      operation: "apply",
    });
    expect(buildTitle(report)).toBe("❌ Apply Failed");
  });
});

describe("buildPlanCountParts", () => {
  it("returns empty array for empty actions", () => {
    const summary = makeSummary();
    expect(buildPlanCountParts(summary)).toEqual([]);
  });

  it("maps create to 'add'", () => {
    const summary = makeSummary([makeActionGroup("create", 3)]);
    expect(buildPlanCountParts(summary)).toEqual(["3 to add"]);
  });

  it("maps update to 'change'", () => {
    const summary = makeSummary([makeActionGroup("update", 1)]);
    expect(buildPlanCountParts(summary)).toEqual(["1 to change"]);
  });

  it("maps delete to 'destroy'", () => {
    const summary = makeSummary([makeActionGroup("delete", 5)]);
    expect(buildPlanCountParts(summary)).toEqual(["5 to destroy"]);
  });

  it("maps replace, import, move, and forget", () => {
    const summary = makeSummary([
      makeActionGroup("replace", 1),
      makeActionGroup("import", 2),
      makeActionGroup("move", 1),
      makeActionGroup("forget", 1),
    ]);
    expect(buildPlanCountParts(summary)).toEqual([
      "1 to replace",
      "2 to import",
      "1 to move",
      "1 to forget",
    ]);
  });

  it("combines counts for duplicate action labels", () => {
    // Two groups with same action → their totals merge
    const summary = makeSummary([
      makeActionGroup("create", 2),
      makeActionGroup("create", 3),
    ]);
    expect(buildPlanCountParts(summary)).toEqual(["5 to add"]);
  });
});

describe("buildApplyCountParts", () => {
  it("returns empty array for empty actions", () => {
    const summary = makeSummary();
    expect(buildApplyCountParts(summary)).toEqual([]);
  });

  it("maps create to 'added'", () => {
    const summary = makeSummary([makeActionGroup("create", 2)]);
    expect(buildApplyCountParts(summary)).toEqual(["2 added"]);
  });

  it("maps update to 'changed'", () => {
    const summary = makeSummary([makeActionGroup("update", 1)]);
    expect(buildApplyCountParts(summary)).toEqual(["1 changed"]);
  });

  it("maps delete to 'destroyed'", () => {
    const summary = makeSummary([makeActionGroup("delete", 3)]);
    expect(buildApplyCountParts(summary)).toEqual(["3 destroyed"]);
  });

  it("maps replace, import, move, and forget", () => {
    const summary = makeSummary([
      makeActionGroup("replace", 1),
      makeActionGroup("import", 2),
      makeActionGroup("move", 1),
      makeActionGroup("forget", 1),
    ]);
    expect(buildApplyCountParts(summary)).toEqual([
      "1 replaced",
      "2 imported",
      "1 moved",
      "1 forgotten",
    ]);
  });
});

describe("buildFailureCountParts", () => {
  it("returns empty array when no failures", () => {
    const summary = makeSummary([], []);
    expect(buildFailureCountParts(summary)).toEqual([]);
  });

  it("returns total failed count", () => {
    const summary = makeSummary(
      [],
      [makeActionGroup("create", 2), makeActionGroup("update", 1)],
    );
    expect(buildFailureCountParts(summary)).toEqual(["3 failed"]);
  });
});
