import { describe, it, expect } from "vitest";
import { buildDriftChanges } from "../../../src/builder/resources.js";
import { buildReport } from "../../../src/builder/index.js";
import type { Plan } from "../../../src/tfjson/plan.js";
import type { ResourceChange as TFResourceChange } from "../../../src/tfjson/resource.js";
import type { ConfigRefIndex } from "../../../src/builder/config-refs.js";

const emptyConfigRefs: ConfigRefIndex = new Map();

function basePlan(resourceDrift: Plan["resource_drift"]): Plan {
  return {
    format_version: "1.2",
    resource_drift: resourceDrift,
  } as Plan;
}

function makeDriftEntry(
  overrides: Partial<TFResourceChange> = {},
): TFResourceChange {
  return {
    address: "null_resource.drifted",
    mode: "managed",
    type: "null_resource",
    name: "drifted",
    change: {
      actions: ["update"],
      before: { id: "abc" },
      after: { id: "abc" },
      before_sensitive: false,
      after_sensitive: false,
      after_unknown: false,
    },
    ...overrides,
  } as TFResourceChange;
}

describe("buildDriftChanges", () => {
  it("returns empty array when resource_drift is undefined", () => {
    const plan = { format_version: "1.2" } as Plan;
    expect(buildDriftChanges(plan, emptyConfigRefs, {})).toEqual([]);
  });

  it("returns empty array when resource_drift is empty", () => {
    const plan = basePlan([]);
    expect(buildDriftChanges(plan, emptyConfigRefs, {})).toEqual([]);
  });

  it("converts drift entries to model ResourceChange objects", () => {
    const plan = basePlan([
      makeDriftEntry({
        address: "aws_instance.web",
        type: "aws_instance",
        name: "web",
        change: {
          actions: ["update"],
          before: { ami: "old" },
          after: { ami: "new" },
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
        },
      }),
    ]);

    const result = buildDriftChanges(plan, emptyConfigRefs, {});

    expect(result).toHaveLength(1);
    expect(result[0]!.address).toBe("aws_instance.web");
    expect(result[0]!.type).toBe("aws_instance");
    expect(result[0]!.action).toBe("update");
  });

  it("skips data sources in drift entries", () => {
    const plan = basePlan([
      makeDriftEntry({
        address: "data.aws_ami.latest",
        mode: "data",
        type: "aws_ami",
        name: "latest",
      }),
    ]);

    const result = buildDriftChanges(plan, emptyConfigRefs, {});
    expect(result).toHaveLength(0);
  });
});

describe("buildReport — drift grouping", () => {
  it("returns drift resources as a flat array in buildReport output", () => {
    const plan: Plan = {
      format_version: "1.2",
      resource_drift: [
        makeDriftEntry({
          address: "null_resource.root_drift",
          type: "null_resource",
          name: "root_drift",
          module_address: undefined,
        }),
        makeDriftEntry({
          address: "module.network.aws_vpc.main",
          type: "aws_vpc",
          name: "main",
          module_address: "module.network",
        }),
        makeDriftEntry({
          address: "module.network.aws_subnet.a",
          type: "aws_subnet",
          name: "a",
          module_address: "module.network",
        }),
      ],
    } as Plan;

    const report = buildReport(plan);

    expect(report.driftResources).toHaveLength(3);
    expect(report.driftResources![0]!.address).toBe("null_resource.root_drift");
    expect(report.driftResources![1]!.address).toBe("module.network.aws_vpc.main");
    expect(report.driftResources![2]!.address).toBe("module.network.aws_subnet.a");
  });
});
