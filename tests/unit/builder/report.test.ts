import { describe, it, expect } from "vitest";
import { buildReport } from "../../../src/builder/index.js";
import type { Plan } from "../../../src/tfjson/plan.js";

function basePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    format_version: "1.2",
    resource_changes: [],
    ...overrides,
  } as Plan;
}

describe("buildReport", () => {
  it("builds a report from an empty plan", () => {
    const report = buildReport(basePlan());
    expect(report.summary).toEqual({ actions: [], failures: [] });
    expect(report.resources).toEqual([]);
    expect(report.outputs).toEqual([]);
  });

  it("includes terraform_version in report", () => {
    const report = buildReport(basePlan({ terraform_version: "1.9.0" }));
    expect(report.toolVersion).toBe("1.9.0");
  });

  it("reports undefined toolVersion when terraform_version is absent", () => {
    const report = buildReport(basePlan());
    expect(report.toolVersion).toBeUndefined();
  });

  it("includes format_version in report", () => {
    const report = buildReport(basePlan());
    expect(report.formatVersion).toBe("1.2");
  });

  it("includes resources from different modules in a flat list", () => {
    const plan = basePlan({
      resource_changes: [
        {
          address: "null_resource.root",
          module_address: undefined,
          mode: "managed",
          type: "null_resource",
          name: "root",
          change: { actions: ["create"], before: null, after: {}, before_sensitive: false, after_sensitive: false, after_unknown: false },
        },
        {
          address: "module.child.null_resource.nested",
          module_address: "module.child",
          mode: "managed",
          type: "null_resource",
          name: "nested",
          change: { actions: ["create"], before: null, after: {}, before_sensitive: false, after_sensitive: false, after_unknown: false },
        },
      ],
    });

    const report = buildReport(plan);
    expect(report.resources).toHaveLength(2);
    expect(report.resources![0]!.address).toBe("null_resource.root");
    expect(report.resources![1]!.address).toBe("module.child.null_resource.nested");
  });

  it("preserves input order for resources from different modules", () => {
    const plan = basePlan({
      resource_changes: [
        {
          address: "module.child.null_resource.nested",
          module_address: "module.child",
          mode: "managed",
          type: "null_resource",
          name: "nested",
          change: { actions: ["create"], before: null, after: {}, before_sensitive: false, after_sensitive: false, after_unknown: false },
        },
        {
          address: "null_resource.root",
          module_address: undefined,
          mode: "managed",
          type: "null_resource",
          name: "root",
          change: { actions: ["create"], before: null, after: {}, before_sensitive: false, after_sensitive: false, after_unknown: false },
        },
      ],
    });

    const report = buildReport(plan);
    expect(report.resources).toHaveLength(2);
    expect(report.resources![0]!.address).toBe("module.child.null_resource.nested");
    expect(report.resources![1]!.address).toBe("null_resource.root");
  });

  it("builds summary counts from resource changes", () => {
    const plan = basePlan({
      resource_changes: [
        {
          address: "null_resource.a",
          mode: "managed",
          type: "null_resource",
          name: "a",
          change: { actions: ["create"], before: null, after: {}, before_sensitive: false, after_sensitive: false, after_unknown: false },
        },
        {
          address: "null_resource.b",
          mode: "managed",
          type: "null_resource",
          name: "b",
          change: { actions: ["delete"], before: {}, after: null, before_sensitive: false, after_sensitive: false, after_unknown: false },
        },
      ],
    });

    const report = buildReport(plan);
    const createGroup = report.summary.actions.find((g) => g.action === "create");
    const deleteGroup = report.summary.actions.find((g) => g.action === "delete");
    expect(createGroup?.total).toBe(1);
    expect(deleteGroup?.total).toBe(1);
    expect(report.summary.failures).toEqual([]);
  });

  it("skips data source read-only changes", () => {
    const plan = basePlan({
      resource_changes: [
        {
          address: "data.null_data_source.test",
          mode: "data",
          type: "null_data_source",
          name: "test",
          change: { actions: ["read"], before: null, after: {}, before_sensitive: false, after_sensitive: false, after_unknown: false },
        },
      ],
    });

    const report = buildReport(plan);
    expect(report.resources).toHaveLength(0);
    expect(report.summary).toEqual({ actions: [], failures: [] });
  });

  it("includes output changes in report outputs", () => {
    const plan = basePlan({
      output_changes: {
        my_output: {
          actions: ["create"],
          before: null,
          after: "result",
          before_sensitive: false,
          after_sensitive: false,
        },
      },
    });

    const report = buildReport(plan);
    expect(report.outputs).toHaveLength(1);
    expect(report.outputs[0]!.name).toBe("my_output");
  });

  it("passes showUnchangedAttributes option to attribute builder", () => {
    const plan = basePlan({
      resource_changes: [
        {
          address: "null_resource.test",
          mode: "managed",
          type: "null_resource",
          name: "test",
          change: {
            actions: ["update"],
            before: { tag: "same" },
            after: { tag: "same" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        },
      ],
    });

    const reportWithout = buildReport(plan, { showUnchangedAttributes: false });
    const reportWith = buildReport(plan, { showUnchangedAttributes: true });

    const resWithout = reportWithout.resources![0]!;
    const resWith = reportWith.resources![0]!;

    expect(resWithout.attributes.length).toBeLessThan(resWith.attributes.length);
  });
});
