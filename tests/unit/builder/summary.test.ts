import { describe, it, expect } from "vitest";
import { buildSummary } from "../../../src/builder/summary.js";
import type { ResourceChange } from "../../../src/model/resource.js";

function makeResource(action: ResourceChange["action"]): ResourceChange {
  return {
    address: `null_resource.${action}`,
    moduleAddress: null,
    type: "null_resource",
    name: action,
    action,
    actionReason: null,
    attributes: [],
    importId: null,
    movedFromAddress: null,
    allUnknownAfterApply: false,
  };
}

describe("buildSummary", () => {
  it("returns all zeros for empty list", () => {
    const summary = buildSummary([]);
    expect(summary).toEqual({ add: 0, change: 0, destroy: 0, replace: 0, total: 0 });
  });

  it("counts creates correctly", () => {
    const summary = buildSummary([makeResource("create"), makeResource("create")]);
    expect(summary.add).toBe(2);
    expect(summary.total).toBe(2);
  });

  it("counts updates correctly", () => {
    const summary = buildSummary([makeResource("update")]);
    expect(summary.change).toBe(1);
    expect(summary.total).toBe(1);
  });

  it("counts deletes correctly", () => {
    const summary = buildSummary([makeResource("delete")]);
    expect(summary.destroy).toBe(1);
    expect(summary.total).toBe(1);
  });

  it("counts replaces correctly", () => {
    const summary = buildSummary([makeResource("replace")]);
    expect(summary.replace).toBe(1);
    expect(summary.total).toBe(1);
  });

  it("does not count no-op actions", () => {
    const summary = buildSummary([makeResource("no-op")]);
    expect(summary.total).toBe(0);
  });

  it("does not count read actions", () => {
    const summary = buildSummary([makeResource("read")]);
    expect(summary.total).toBe(0);
  });

  it("does not count forget actions", () => {
    const summary = buildSummary([makeResource("forget")]);
    expect(summary.total).toBe(0);
  });

  it("does not count unknown actions", () => {
    const summary = buildSummary([makeResource("unknown")]);
    expect(summary.total).toBe(0);
  });

  it("totals mixed actions", () => {
    const resources = [
      makeResource("create"),
      makeResource("create"),
      makeResource("update"),
      makeResource("delete"),
      makeResource("replace"),
      makeResource("no-op"),
    ];
    const summary = buildSummary(resources);
    expect(summary.add).toBe(2);
    expect(summary.change).toBe(1);
    expect(summary.destroy).toBe(1);
    expect(summary.replace).toBe(1);
    expect(summary.total).toBe(5);
  });
});
