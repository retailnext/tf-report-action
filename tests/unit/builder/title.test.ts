import { describe, it, expect } from "vitest";
import {
  buildStructuredTitle,
  buildPlanCountParts,
  buildApplyCountParts,
  buildFailureCountParts,
} from "../../../src/builder/title.js";
import type { Report } from "../../../src/model/report.js";
import type { Summary, SummaryActionGroup } from "../../../src/model/summary.js";

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

function makeReport(summary: Summary): Report {
  return {
    title: "",
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: [],
    summary,
  };
}

describe("buildStructuredTitle", () => {
  it("returns plan title with create counts", () => {
    const summary = makeSummary([makeActionGroup("create", 3)]);
    const report = makeReport(summary);
    const title = buildStructuredTitle(report, false, undefined, false);
    expect(title).toBe("✅ Plan: 3 to add");
  });

  it("returns plan title with multiple action counts", () => {
    const summary = makeSummary([
      makeActionGroup("create", 2),
      makeActionGroup("update", 1),
      makeActionGroup("delete", 3),
    ]);
    const report = makeReport(summary);
    const title = buildStructuredTitle(report, false, undefined, false);
    expect(title).toBe("✅ Plan: 2 to add, 1 to change, 3 to destroy");
  });

  it("returns 'No Changes' when no actions and no failures", () => {
    const summary = makeSummary();
    const report = makeReport(summary);
    const title = buildStructuredTitle(report, false, undefined, false);
    expect(title).toBe("✅ No Changes");
  });

  it("returns 'Plan Failed' when summary has failures", () => {
    const summary = makeSummary([], [makeActionGroup("create", 1)]);
    const report = makeReport(summary);
    const title = buildStructuredTitle(report, false, undefined, false);
    expect(title).toBe("❌ Plan Failed");
  });

  it("returns 'Plan Failed' when hasStepFailures is true", () => {
    const summary = makeSummary([makeActionGroup("create", 2)]);
    const report = makeReport(summary);
    const title = buildStructuredTitle(report, false, undefined, true);
    expect(title).toBe("❌ Plan Failed");
  });

  it("includes workspace prefix when workspace is provided", () => {
    const summary = makeSummary([makeActionGroup("create", 1)]);
    const report = makeReport(summary);
    const title = buildStructuredTitle(report, false, "staging", false);
    expect(title).toBe("✅ `staging` Plan: 1 to add");
  });

  it("includes workspace prefix in No Changes title", () => {
    const summary = makeSummary();
    const report = makeReport(summary);
    const title = buildStructuredTitle(report, false, "prod", false);
    expect(title).toBe("✅ `prod` No Changes");
  });

  it("returns apply title with successful counts", () => {
    const summary = makeSummary([
      makeActionGroup("create", 1),
      makeActionGroup("update", 2),
    ]);
    const report = makeReport(summary);
    const title = buildStructuredTitle(report, true, undefined, false);
    expect(title).toBe("✅ Apply: 1 added, 2 changed");
  });

  it("returns 'Apply Complete' when apply has no actions", () => {
    const summary = makeSummary();
    const report = makeReport(summary);
    const title = buildStructuredTitle(report, true, undefined, false);
    expect(title).toBe("✅ Apply Complete");
  });

  it("returns 'Apply Failed' with failure and success counts", () => {
    const summary = makeSummary(
      [makeActionGroup("create", 1)],
      [makeActionGroup("create", 2)],
    );
    const report = makeReport(summary);
    const title = buildStructuredTitle(report, true, undefined, false);
    expect(title).toBe("❌ Apply Failed: 2 failed, 1 added");
  });

  it("includes workspace prefix in apply titles", () => {
    const summary = makeSummary([makeActionGroup("delete", 1)]);
    const report = makeReport(summary);
    const title = buildStructuredTitle(report, true, "prod", false);
    expect(title).toBe("✅ `prod` Apply: 1 destroyed");
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
    const summary = makeSummary([], [
      makeActionGroup("create", 2),
      makeActionGroup("update", 1),
    ]);
    expect(buildFailureCountParts(summary)).toEqual(["3 failed"]);
  });
});
