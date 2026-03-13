import { describe, it, expect } from "vitest";
import { buildSummary, buildApplySummary } from "../../../src/builder/summary.js";
import type { ResourceChange } from "../../../src/model/resource.js";

function makeResource(
  action: ResourceChange["action"],
  type = "null_resource",
  name?: string,
): ResourceChange {
  return {
    address: `${type}.${name ?? action}`,
    moduleAddress: null,
    type,
    name: name ?? action,
    action,
    actionReason: null,
    attributes: [],
    importId: null,
    movedFromAddress: null,
    allUnknownAfterApply: false,
  };
}

describe("buildSummary", () => {
  it("returns empty actions and failures for empty list", () => {
    const summary = buildSummary([]);
    expect(summary.actions).toEqual([]);
    expect(summary.failures).toEqual([]);
  });

  it("groups creates with resource type breakdown", () => {
    const summary = buildSummary([
      makeResource("create", "aws_instance", "a"),
      makeResource("create", "aws_instance", "b"),
      makeResource("create", "aws_s3_bucket", "c"),
    ]);
    expect(summary.actions).toHaveLength(1);
    const group = summary.actions[0]!;
    expect(group.action).toBe("create");
    expect(group.total).toBe(3);
    expect(group.resourceTypes).toEqual([
      { type: "aws_instance", count: 2 },
      { type: "aws_s3_bucket", count: 1 },
    ]);
  });

  it("groups multiple actions in display order", () => {
    const resources = [
      makeResource("delete", "aws_instance", "a"),
      makeResource("create", "aws_instance", "b"),
      makeResource("update", "aws_instance", "c"),
      makeResource("replace", "aws_instance", "d"),
    ];
    const summary = buildSummary(resources);
    const actions = summary.actions.map((g) => g.action);
    expect(actions).toEqual(["create", "update", "replace", "delete"]);
  });

  it("does not count no-op, read, forget, or unknown actions", () => {
    const summary = buildSummary([
      makeResource("no-op"),
      makeResource("read"),
      makeResource("forget"),
      makeResource("unknown"),
    ]);
    expect(summary.actions).toEqual([]);
  });

  it("sorts resource types by count desc, then alphabetically", () => {
    const resources = [
      makeResource("create", "aws_s3_bucket", "s1"),
      makeResource("create", "aws_instance", "a1"),
      makeResource("create", "aws_instance", "a2"),
      makeResource("create", "aws_lambda_function", "l1"),
      makeResource("create", "aws_lambda_function", "l2"),
    ];
    const summary = buildSummary(resources);
    const types = summary.actions[0]!.resourceTypes.map((rt) => rt.type);
    // aws_instance and aws_lambda_function both have 2 → alphabetical
    expect(types).toEqual(["aws_instance", "aws_lambda_function", "aws_s3_bucket"]);
  });

  it("plan summary always has empty failures", () => {
    const summary = buildSummary([makeResource("create")]);
    expect(summary.failures).toEqual([]);
  });
});

describe("buildApplySummary", () => {
  it("separates failed from successful resources", () => {
    const resources = [
      makeResource("create", "aws_instance", "a"),
      makeResource("create", "aws_instance", "b"),
      makeResource("update", "aws_iam_policy", "c"),
    ];
    const failed = new Set(["aws_instance.b", "aws_iam_policy.c"]);
    const summary = buildApplySummary(resources, failed);

    // Successful: 1 create
    expect(summary.actions).toHaveLength(1);
    expect(summary.actions[0]!.action).toBe("create");
    expect(summary.actions[0]!.total).toBe(1);

    // Failed: 1 create, 1 update
    expect(summary.failures).toHaveLength(2);
    const failActions = summary.failures.map((g) => g.action);
    expect(failActions).toEqual(["create", "update"]);
  });

  it("handles all resources succeeding", () => {
    const resources = [makeResource("create", "null_resource", "a")];
    const summary = buildApplySummary(resources, new Set());
    expect(summary.actions).toHaveLength(1);
    expect(summary.failures).toEqual([]);
  });

  it("handles all resources failing", () => {
    const resources = [makeResource("create", "null_resource", "a")];
    const summary = buildApplySummary(resources, new Set(["null_resource.a"]));
    expect(summary.actions).toEqual([]);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]!.action).toBe("create");
  });

  it("preserves resource type breakdown for failures", () => {
    const resources = [
      makeResource("create", "aws_instance", "a"),
      makeResource("create", "aws_s3_bucket", "b"),
    ];
    const failed = new Set(["aws_instance.a", "aws_s3_bucket.b"]);
    const summary = buildApplySummary(resources, failed);
    const group = summary.failures[0]!;
    expect(group.resourceTypes).toHaveLength(2);
    expect(group.total).toBe(2);
  });
});
