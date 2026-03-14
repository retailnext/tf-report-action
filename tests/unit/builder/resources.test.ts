import { describe, it, expect } from "vitest";
import { buildResourceChanges } from "../../../src/builder/resources.js";
import type { Plan } from "../../../src/tfjson/plan.js";
import type { ConfigRefIndex } from "../../../src/builder/config-refs.js";

const emptyConfigRefs: ConfigRefIndex = new Map();

function basePlan(resourceChanges: Plan["resource_changes"]): Plan {
  return {
    format_version: "1.2",
    resource_changes: resourceChanges,
  } as Plan;
}

describe("buildResourceChanges", () => {
  it("returns empty array when resource_changes is undefined", () => {
    const plan = { format_version: "1.2" } as Plan;
    expect(buildResourceChanges(plan, emptyConfigRefs, {})).toEqual([]);
  });

  it("falls back to constructed address when rc.address is missing", () => {
    const plan = basePlan([
      {
        // No address field
        mode: "managed",
        type: "null_resource",
        name: "fallback",
        change: {
          actions: ["create"],
          before: null,
          after: {},
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
        },
      } as Plan["resource_changes"][0],
    ]);
    const result = buildResourceChanges(plan, emptyConfigRefs, {});
    expect(result[0]!.address).toBe("null_resource.fallback");
  });

  it("falls back to 'unknown' when type and name are missing", () => {
    const plan = basePlan([
      {
        mode: "managed",
        change: {
          actions: ["create"],
          before: null,
          after: {},
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
        },
      } as Plan["resource_changes"][0],
    ]);
    const result = buildResourceChanges(plan, emptyConfigRefs, {});
    expect(result[0]!.address).toBe("unknown.unknown");
    expect(result[0]!.type).toBe("unknown");
    expect(result[0]!.name).toBe("unknown");
  });

  it("captures importId from change.importing.id", () => {
    const plan = basePlan([
      {
        address: "null_resource.imported",
        mode: "managed",
        type: "null_resource",
        name: "imported",
        change: {
          actions: ["create"],
          before: null,
          after: {},
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
          importing: { id: "i-abc123" },
        },
      },
    ]);
    const result = buildResourceChanges(plan, emptyConfigRefs, {});
    expect(result[0]!.importId).toBe("i-abc123");
  });

  it("captures actionReason when present", () => {
    const plan = basePlan([
      {
        address: "null_resource.reason",
        mode: "managed",
        type: "null_resource",
        name: "reason",
        action_reason: "replace_because_tainted",
        change: {
          actions: ["delete", "create"],
          before: {},
          after: {},
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
        },
      },
    ]);
    const result = buildResourceChanges(plan, emptyConfigRefs, {});
    expect(result[0]!.actionReason).toBe("replace_because_tainted");
  });

  it("captures movedFromAddress and upgrades action to move", () => {
    const plan = basePlan([
      {
        address: "null_resource.new",
        previous_address: "null_resource.old",
        mode: "managed",
        type: "null_resource",
        name: "new",
        change: {
          actions: ["no-op"],
          before: {},
          after: {},
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
        },
      },
    ]);
    const result = buildResourceChanges(plan, emptyConfigRefs, {});
    expect(result).toHaveLength(1);
    expect(result[0]!.movedFromAddress).toBe("null_resource.old");
    expect(result[0]!.action).toBe("move");
  });

  it("upgrades no-op with importId to import action", () => {
    const plan = basePlan([
      {
        address: "null_resource.imported",
        mode: "managed",
        type: "null_resource",
        name: "imported",
        change: {
          actions: ["no-op"],
          before: {},
          after: {},
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
          importing: { id: "i-abc123" },
        },
      },
    ]);
    const result = buildResourceChanges(plan, emptyConfigRefs, {});
    expect(result).toHaveLength(1);
    expect(result[0]!.action).toBe("import");
    expect(result[0]!.importId).toBe("i-abc123");
  });

  it("keeps create action when import is combined with create", () => {
    const plan = basePlan([
      {
        address: "null_resource.imported",
        mode: "managed",
        type: "null_resource",
        name: "imported",
        change: {
          actions: ["create"],
          before: null,
          after: {},
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
          importing: { id: "i-abc123" },
        },
      },
    ]);
    const result = buildResourceChanges(plan, emptyConfigRefs, {});
    expect(result).toHaveLength(1);
    expect(result[0]!.action).toBe("create");
    expect(result[0]!.importId).toBe("i-abc123");
  });

  it("filters out true no-op resources", () => {
    const plan = basePlan([
      {
        address: "null_resource.unchanged",
        mode: "managed",
        type: "null_resource",
        name: "unchanged",
        change: {
          actions: ["no-op"],
          before: {},
          after: {},
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
        },
      },
    ]);
    const result = buildResourceChanges(plan, emptyConfigRefs, {});
    expect(result).toHaveLength(0);
  });

  it("sets allUnknownAfterApply=true when after_unknown is boolean true", () => {
    const plan = basePlan([
      {
        address: "null_resource.all_unknown",
        mode: "managed",
        type: "null_resource",
        name: "all_unknown",
        change: {
          actions: ["create"],
          before: null,
          after: null,
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: true,
        },
      },
    ]);
    const result = buildResourceChanges(plan, emptyConfigRefs, {});
    expect(result[0]!.allUnknownAfterApply).toBe(true);
  });

  it("skips data source read-only changes", () => {
    const plan = basePlan([
      {
        address: "data.null_data_source.lookup",
        mode: "data",
        type: "null_data_source",
        name: "lookup",
        change: {
          actions: ["read"],
          before: null,
          after: {},
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
        },
      },
    ]);
    const result = buildResourceChanges(plan, emptyConfigRefs, {});
    expect(result).toHaveLength(0);
  });

  it("skips data sources with non-read actions", () => {
    const plan = basePlan([
      {
        address: "data.null_data_source.changing",
        mode: "data",
        type: "null_data_source",
        name: "changing",
        change: {
          actions: ["create"],
          before: null,
          after: {},
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
        },
      },
    ]);
    const result = buildResourceChanges(plan, emptyConfigRefs, {});
    expect(result).toHaveLength(0);
  });
});
