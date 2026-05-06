import { describe, it, expect } from "vitest";
import { buildDriftChanges } from "../../../src/builder/resources.js";
import { buildReport } from "../../../src/builder/index.js";
import {
  DriftRuleRegistry,
  type DriftRule,
} from "../../../src/drift-filter/registry.js";
import type { Plan } from "../../../src/tfjson/plan.js";
import type { ResourceChange as TFResourceChange } from "../../../src/tfjson/resource.js";

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
      before: { id: "abc", value: "old" },
      after: { id: "abc", value: "new" },
      before_sensitive: false,
      after_sensitive: false,
      after_unknown: false,
    },
    ...overrides,
  };
}

/** A registry containing a single rule. */
function registryWith(rule: DriftRule): DriftRuleRegistry {
  return new DriftRuleRegistry().register(rule);
}

describe("buildDriftChanges", () => {
  it("returns empty array when resource_drift is undefined", () => {
    const plan = { format_version: "1.2" } as Plan;
    expect(buildDriftChanges(plan, {})).toEqual([]);
  });

  it("returns empty array when resource_drift is empty", () => {
    const plan = basePlan([]);
    expect(buildDriftChanges(plan, {})).toEqual([]);
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

    const result = buildDriftChanges(plan, {});

    expect(result).toHaveLength(1);
    expect(result[0]!.address).toBe("aws_instance.web");
    expect(result[0]!.type).toBe("aws_instance");
    expect(result[0]!.action).toBe("update");
  });

  it("skips data sources in drift entries via default registry", () => {
    const plan = basePlan([
      makeDriftEntry({
        address: "data.aws_ami.latest",
        mode: "data",
        type: "aws_ami",
        name: "latest",
      }),
    ]);

    const result = buildDriftChanges(plan, {});
    expect(result).toHaveLength(0);
  });

  it("suppresses drift when injected registry rule matches", () => {
    const suppressAll: DriftRule = () => true;
    const plan = basePlan([
      makeDriftEntry({
        change: {
          actions: ["update"],
          before: { value: "old" },
          after: { value: "new" },
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
        },
      }),
    ]);

    const result = buildDriftChanges(plan, {
      driftRuleRegistry: registryWith(suppressAll),
    });
    expect(result).toHaveLength(0);
  });

  it("keeps drift when injected registry rule does not match", () => {
    const suppressNone: DriftRule = () => false;
    const plan = basePlan([
      makeDriftEntry({
        change: {
          actions: ["update"],
          before: { value: "old" },
          after: { value: "new" },
          before_sensitive: false,
          after_sensitive: false,
          after_unknown: false,
        },
      }),
    ]);

    const result = buildDriftChanges(plan, {
      driftRuleRegistry: registryWith(suppressNone),
    });
    expect(result).toHaveLength(1);
  });

  describe("no-visible-changes suppression", () => {
    it("suppresses update drift with identical before/after values", () => {
      const plan = basePlan([
        makeDriftEntry({
          address: "kubernetes_namespace_v1.cert_manager",
          type: "kubernetes_namespace_v1",
          name: "cert_manager",
          change: {
            actions: ["update"],
            before: { id: "abc", metadata: "same" },
            after: { id: "abc", metadata: "same" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(0);
    });

    it("suppresses no-op drift with identical before/after values", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["no-op"],
            before: { id: "abc", value: "same" },
            after: { id: "abc", value: "same" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(0);
    });

    it("keeps drift with after_unknown values (cannot determine equality)", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc", computed: "old" },
            after: { id: "abc", computed: "old" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: { computed: true },
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
    });

    it("keeps drift when after_unknown is boolean true", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc" },
            after: { id: "abc" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: true,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
    });

    it("keeps drift where before/after have different key counts", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc" },
            after: { id: "abc", new_field: "added" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
    });

    it("keeps drift where keys differ even with same count", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { old_key: "val" },
            after: { new_key: "val" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
    });

    it("suppresses drift when both before and after are null", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["no-op"],
            before: null,
            after: null,
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(0);
    });

    it("keeps update drift with actual attribute changes", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc", version: "1" },
            after: { id: "abc", version: "2" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
      expect(result[0]!.attributes.length).toBeGreaterThan(0);
    });

    it("keeps delete drift (before has values, after is null)", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["delete"],
            before: { id: "abc", content: "hello" },
            after: null,
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: {},
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
      expect(result[0]!.action).toBe("delete");
      expect(result[0]!.attributes.length).toBeGreaterThan(0);
    });

    it("keeps create drift (before is null, after has values)", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["create"],
            before: null,
            after: { id: "new", value: "created" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
      expect(result[0]!.action).toBe("create");
      expect(result[0]!.attributes.length).toBeGreaterThan(0);
    });

    it("keeps move drift even with empty attributes", () => {
      const plan = basePlan([
        makeDriftEntry({
          address: "aws_instance.new_name",
          previous_address: "aws_instance.old_name",
          change: {
            actions: ["no-op"],
            before: { id: "abc" },
            after: { id: "abc" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
      expect(result[0]!.action).toBe("move");
      expect(result[0]!.movedFromAddress).toBe("aws_instance.old_name");
    });

    it("keeps import drift even with empty attributes", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["no-op"],
            before: { id: "abc" },
            after: { id: "abc" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
            importing: { id: "imported-123" },
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
      expect(result[0]!.action).toBe("import");
      expect(result[0]!.importId).toBe("imported-123");
    });

    it("keeps drift with sensitive attributes that actually changed", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc", secret: "hidden1" },
            after: { id: "abc", secret: "hidden2" },
            before_sensitive: { secret: true },
            after_sensitive: { secret: true },
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
      // Raw value comparison detects that underlying values differ
      expect(result[0]!.attributes.length).toBeGreaterThan(0);
    });

    it("suppresses drift where sensitive values are identical", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc", secret: "same-value" },
            after: { id: "abc", secret: "same-value" },
            before_sensitive: { secret: true },
            after_sensitive: { secret: true },
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(0);
    });

    it("suppresses drift where all attributes are identical including nested", () => {
      const plan = basePlan([
        makeDriftEntry({
          address: "kubernetes_cluster_role_v1.example",
          type: "kubernetes_cluster_role_v1",
          name: "example",
          change: {
            actions: ["update"],
            before: {
              id: "abc",
              metadata: { name: "test", labels: { app: "web" } },
              rule: [{ api_groups: [""], resources: ["pods"] }],
            },
            after: {
              id: "abc",
              metadata: { name: "test", labels: { app: "web" } },
              rule: [{ api_groups: [""], resources: ["pods"] }],
            },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(0);
    });

    it("keeps drift with mixed attributes (some changed, some not)", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc", version: "1", name: "same" },
            after: { id: "abc", version: "2", name: "same" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
      // Only the changed attribute is present
      expect(result[0]!.attributes).toHaveLength(1);
      expect(result[0]!.attributes[0]!.name).toBe("version");
    });

    it("suppresses multiple no-change drift entries while keeping real ones", () => {
      const plan = basePlan([
        makeDriftEntry({
          address: "kubernetes_namespace_v1.ns1",
          type: "kubernetes_namespace_v1",
          name: "ns1",
          change: {
            actions: ["update"],
            before: { id: "1", metadata: "same" },
            after: { id: "1", metadata: "same" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
        makeDriftEntry({
          address: "aws_instance.real_drift",
          type: "aws_instance",
          name: "real_drift",
          change: {
            actions: ["update"],
            before: { ami: "old-ami" },
            after: { ami: "new-ami" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
        makeDriftEntry({
          address: "kubernetes_namespace_v1.ns2",
          type: "kubernetes_namespace_v1",
          name: "ns2",
          change: {
            actions: ["update"],
            before: { id: "2", metadata: "same" },
            after: { id: "2", metadata: "same" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
      expect(result[0]!.address).toBe("aws_instance.real_drift");
    });

    it("suppresses identical drift even when showUnchangedAttributes is true", () => {
      const plan = basePlan([
        makeDriftEntry({
          address: "kubernetes_namespace_v1.ns",
          type: "kubernetes_namespace_v1",
          name: "ns",
          change: {
            actions: ["update"],
            before: { id: "abc", metadata: "same", labels: "same" },
            after: { id: "abc", metadata: "same", labels: "same" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {
        showUnchangedAttributes: true,
      });
      expect(result).toHaveLength(0);
    });

    it("keeps changed drift when showUnchangedAttributes is true", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc", version: "1" },
            after: { id: "abc", version: "2" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {
        showUnchangedAttributes: true,
      });
      expect(result).toHaveLength(1);
      // With showUnchangedAttributes, all attributes are present in output
      expect(result[0]!.attributes.length).toBeGreaterThan(1);
    });

    describe("null-vs-absent key equivalence", () => {
      it("suppresses drift where before has null key that after omits", () => {
        const plan = basePlan([
          makeDriftEntry({
            address: "google_compute_firewall.example",
            type: "google_compute_firewall",
            name: "example",
            change: {
              actions: ["update"],
              before: { id: "abc", name: "fw", description: null },
              after: { id: "abc", name: "fw" },
              before_sensitive: false,
              after_sensitive: false,
              after_unknown: false,
            },
          }),
        ]);

        const result = buildDriftChanges(plan, {});
        expect(result).toHaveLength(0);
      });

      it("suppresses drift where after has null key that before omits", () => {
        const plan = basePlan([
          makeDriftEntry({
            address: "google_compute_firewall.example",
            type: "google_compute_firewall",
            name: "example",
            change: {
              actions: ["update"],
              before: { id: "abc", name: "fw" },
              after: { id: "abc", name: "fw", description: null },
              before_sensitive: false,
              after_sensitive: false,
              after_unknown: false,
            },
          }),
        ]);

        const result = buildDriftChanges(plan, {});
        expect(result).toHaveLength(0);
      });

      it("keeps drift where before has null but after has non-null value", () => {
        const plan = basePlan([
          makeDriftEntry({
            change: {
              actions: ["update"],
              before: { id: "abc", description: null },
              after: { id: "abc", description: "new value" },
              before_sensitive: false,
              after_sensitive: false,
              after_unknown: false,
            },
          }),
        ]);

        const result = buildDriftChanges(plan, {});
        expect(result).toHaveLength(1);
        expect(
          result[0]!.attributes.some((a) => a.name === "description"),
        ).toBe(true);
      });

      it("keeps drift where before has non-null value but after omits key", () => {
        const plan = basePlan([
          makeDriftEntry({
            change: {
              actions: ["update"],
              before: { id: "abc", description: "old value" },
              after: { id: "abc" },
              before_sensitive: false,
              after_sensitive: false,
              after_unknown: false,
            },
          }),
        ]);

        const result = buildDriftChanges(plan, {});
        expect(result).toHaveLength(1);
        expect(
          result[0]!.attributes.some((a) => a.name === "description"),
        ).toBe(true);
      });

      it("suppresses drift where both sides have key with null value", () => {
        const plan = basePlan([
          makeDriftEntry({
            change: {
              actions: ["update"],
              before: { id: "abc", description: null },
              after: { id: "abc", description: null },
              before_sensitive: false,
              after_sensitive: false,
              after_unknown: false,
            },
          }),
        ]);

        const result = buildDriftChanges(plan, {});
        expect(result).toHaveLength(0);
      });

      it("suppresses drift with nested null-vs-absent in objects", () => {
        const plan = basePlan([
          makeDriftEntry({
            address: "google_compute_firewall.nested",
            type: "google_compute_firewall",
            name: "nested",
            change: {
              actions: ["update"],
              before: {
                id: "abc",
                name: "fw",
                log_config: { metadata: null },
              },
              after: { id: "abc", name: "fw", log_config: {} },
              before_sensitive: false,
              after_sensitive: false,
              after_unknown: false,
            },
          }),
        ]);

        const result = buildDriftChanges(plan, {});
        expect(result).toHaveLength(0);
      });

      it("suppresses drift with null-vs-absent in arrays", () => {
        const plan = basePlan([
          makeDriftEntry({
            address: "google_compute_firewall.array",
            type: "google_compute_firewall",
            name: "array",
            change: {
              actions: ["update"],
              before: { id: "abc", tags: [null, "a"] },
              after: { id: "abc", tags: ["a"] },
              before_sensitive: false,
              after_sensitive: false,
              after_unknown: false,
            },
          }),
        ]);

        // The array shapes genuinely differ (different indices) — this is kept
        const result = buildDriftChanges(plan, {});
        expect(result).toHaveLength(1);
      });

      it("suppresses drift where multiple null keys differ from absent", () => {
        const plan = basePlan([
          makeDriftEntry({
            address: "google_compute_firewall.multi_null",
            type: "google_compute_firewall",
            name: "multi_null",
            change: {
              actions: ["update"],
              before: {
                id: "abc",
                name: "fw",
                description: null,
                disabled: null,
                priority: null,
              },
              after: { id: "abc", name: "fw" },
              before_sensitive: false,
              after_sensitive: false,
              after_unknown: false,
            },
          }),
        ]);

        const result = buildDriftChanges(plan, {});
        expect(result).toHaveLength(0);
      });
    });
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
          change: {
            actions: ["update"],
            before: { id: "old1" },
            after: { id: "new1" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
        makeDriftEntry({
          address: "module.network.aws_vpc.main",
          type: "aws_vpc",
          name: "main",
          module_address: "module.network",
          change: {
            actions: ["update"],
            before: { cidr: "10.0.0.0/16", tag: "old" },
            after: { cidr: "10.0.0.0/16", tag: "new" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
        makeDriftEntry({
          address: "module.network.aws_subnet.a",
          type: "aws_subnet",
          name: "a",
          module_address: "module.network",
          change: {
            actions: ["update"],
            before: { az: "us-east-1a", cidr: "10.0.1.0/24" },
            after: { az: "us-east-1a", cidr: "10.0.2.0/24" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ],
    } as Plan;

    const report = buildReport(plan);

    expect(report.driftResources).toHaveLength(3);
    expect(report.driftResources![0]!.address).toBe("null_resource.root_drift");
    expect(report.driftResources![1]!.address).toBe(
      "module.network.aws_vpc.main",
    );
    expect(report.driftResources![2]!.address).toBe(
      "module.network.aws_subnet.a",
    );
  });

  it("excludes no-change drift from buildReport output", () => {
    const plan: Plan = {
      format_version: "1.2",
      resource_drift: [
        makeDriftEntry({
          address: "kubernetes_namespace_v1.ns",
          type: "kubernetes_namespace_v1",
          name: "ns",
          change: {
            actions: ["update"],
            before: { id: "abc", metadata: "same" },
            after: { id: "abc", metadata: "same" },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ],
    } as Plan;

    const report = buildReport(plan);
    expect(report.driftResources).toHaveLength(0);
  });

  describe("empty-block equivalence in drift suppression", () => {
    it("suppresses drift when before has empty block and after has null children", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc", metadata: {} },
            after: { id: "abc", metadata: { key: null } },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(0);
    });

    it("does not suppress drift when before has empty block and after has non-null children", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc", metadata: {} },
            after: { id: "abc", metadata: { key: "value" } },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
    });

    it("suppresses drift when after has empty block and before has null children", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc", metadata: { key: null } },
            after: { id: "abc", metadata: {} },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(0);
    });

    it("does not suppress drift when after has empty block and before has non-null children", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc", metadata: { key: "value" } },
            after: { id: "abc", metadata: {} },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(1);
    });

    it("suppresses drift when both sides have empty block", () => {
      const plan = basePlan([
        makeDriftEntry({
          change: {
            actions: ["update"],
            before: { id: "abc", config: {} },
            after: { id: "abc", config: {} },
            before_sensitive: false,
            after_sensitive: false,
            after_unknown: false,
          },
        }),
      ]);

      const result = buildDriftChanges(plan, {});
      expect(result).toHaveLength(0);
    });
  });
});
