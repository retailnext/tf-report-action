import { describe, it, expect } from "vitest";
import { buildApplyReport } from "../../../src/builder/apply.js";
import type { Plan } from "../../../src/tfjson/plan.js";
import type { UIOutputsMessage } from "../../../src/tfjson/machine-readable-ui.js";
import type { ScanResult } from "../../../src/jsonl-scanner/types.js";
import { VALUE_NOT_IN_PLAN } from "../../../src/model/sentinels.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Minimal plan with resource changes and optional output changes. */
function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    format_version: "1.2",
    terraform_version: "1.9.0",
    planned_values: { root_module: { resources: [] } },
    resource_changes: [],
    configuration: { root_module: {} },
    ...overrides,
  } as Plan;
}

/** Creates a minimal resource change for the plan. */
function resourceChange(
  address: string,
  actions: string[],
  overrides: Record<string, unknown> = {},
) {
  // previous_address is a top-level ResourceChange field, not inside change
  const { previous_address, ...changeOverrides } = overrides;
  return {
    address,
    mode: "managed",
    type: address.split(".")[0],
    name: address.split(".").slice(1).join("."),
    provider_name: "registry.terraform.io/hashicorp/null",
    ...(previous_address !== undefined ? { previous_address } : {}),
    change: {
      actions,
      before: null,
      after: null,
      after_unknown: {},
      before_sensitive: {},
      after_sensitive: {},
      ...changeOverrides,
    },
  };
}

/** Creates a plan output change. */
function outputChange(
  name: string,
  actions: string[],
  before: unknown,
  after: unknown,
  { afterUnknown = false, sensitive = false } = {},
) {
  return {
    [name]: {
      actions,
      before,
      after,
      after_unknown: afterUnknown,
      before_sensitive: sensitive,
      after_sensitive: sensitive,
    },
  };
}

/** Creates a ScanResult with sensible defaults. */
function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    plannedChanges: [],
    applyStatuses: [],
    diagnostics: [],
    driftChanges: [],
    totalLines: 0,
    parsedLines: 0,
    unknownTypeLines: 0,
    unparseableLines: 0,
    ...overrides,
  };
}

/** Creates a UIOutputsMessage from a simplified outputs map. */
function makeOutputsMessage(
  outputs: Record<string, { sensitive: boolean; value?: unknown }>,
): UIOutputsMessage {
  return {
    "@level": "info",
    "@message": "Outputs",
    "@module": "terraform.ui",
    "@timestamp": "2024-01-01T00:00:03.000Z",
    type: "outputs",
    outputs: Object.fromEntries(
      Object.entries(outputs).map(([name, { sensitive, value }]) => [
        name,
        { sensitive, ...(value !== undefined ? { value } : {}) },
      ]),
    ),
  } as UIOutputsMessage;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("buildApplyReport", () => {
  describe("phantom filtering", () => {
    it("excludes resources that have no apply status", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.real", ["update"], {
            before: { id: "1", triggers_replace: null },
            after: { id: "1", triggers_replace: null },
          }),
          resourceChange("null_resource.phantom", ["update"], {
            before: { id: "2", triggers_replace: null },
            after: { id: "2", triggers_replace: null },
          }),
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          { address: "null_resource.real", action: "update", success: true },
        ],
      });

      const report = buildApplyReport(plan, scanResult);

      const allAddresses = report.resources!.map((r) => r.address);
      expect(allAddresses).toContain("null_resource.real");
      expect(allAddresses).not.toContain("null_resource.phantom");
    });

    it("includes resources that have apply_errored (even without apply_complete)", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.failing", ["delete", "create"], {
            before: { id: "1", triggers_replace: null },
            after: { id: "1", triggers_replace: null },
          }),
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          { address: "null_resource.failing", action: "create", success: false },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      const allAddresses = report.resources!.map((r) => r.address);
      expect(allAddresses).toContain("null_resource.failing");
    });

    it("removes empty module groups after filtering", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.phantom_a", ["update"], {
            before: { id: "1", triggers_replace: null },
            after: { id: "1", triggers_replace: null },
          }),
          resourceChange("null_resource.phantom_b", ["update"], {
            before: { id: "2", triggers_replace: null },
            after: { id: "2", triggers_replace: null },
          }),
        ],
      });

      // No apply statuses — all resources are phantoms
      const report = buildApplyReport(plan, makeScanResult());
      expect(report.resources!).toHaveLength(0);
    });

    it("data sources are always excluded from resource changes", () => {
      const plan = makePlan({
        resource_changes: [
          {
            ...resourceChange("data.local_command.read_config", ["read"]),
            mode: "data",
          },
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          { address: "data.local_command.read_config", action: "read", success: true },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      const allAddresses = report.resources!.map((r) => r.address);
      expect(allAddresses).not.toContain("data.local_command.read_config");
    });

    it("data source errors appear in diagnostics even though resource is excluded", () => {
      const plan = makePlan({
        resource_changes: [
          {
            ...resourceChange("data.external.failing_query", ["read"]),
            mode: "data",
          },
          resourceChange("null_resource.keeper", ["update"]),
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          { address: "null_resource.keeper", action: "update", success: true },
        ],
        diagnostics: [
          {
            severity: "error",
            summary: "Failed to read data source",
            detail: "data.external.failing_query: query returned non-zero exit code",
            address: "data.external.failing_query",
          },
        ],
      });

      const report = buildApplyReport(plan, scanResult);

      // Data source must NOT appear in resource changes
      const allAddresses = report.resources!.map((r) => r.address);
      expect(allAddresses).not.toContain("data.external.failing_query");
      // But the managed resource should still be present
      expect(allAddresses).toContain("null_resource.keeper");

      // The data source error MUST appear in diagnostics
      expect(report.diagnostics).toBeDefined();
      expect(report.diagnostics).toHaveLength(1);
      expect(report.diagnostics![0]!.address).toBe("data.external.failing_query");
      expect(report.diagnostics![0]!.severity).toBe("error");
      expect(report.diagnostics![0]!.summary).toBe("Failed to read data source");
      expect(report.diagnostics![0]!.source).toBe("apply");
    });
  });

  describe("summary recalculation", () => {
    it("recalculates summary to reflect only applied resources", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.applied", ["update"], {
            before: { id: "1", triggers_replace: null },
            after: { id: "1", triggers_replace: null },
          }),
          resourceChange("null_resource.phantom_1", ["update"], {
            before: { id: "2", triggers_replace: null },
            after: { id: "2", triggers_replace: null },
          }),
          resourceChange("null_resource.phantom_2", ["create"]),
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          { address: "null_resource.applied", action: "update", success: true },
        ],
      });

      const report = buildApplyReport(plan, scanResult);

      // Only the applied resource should be counted
      const updateGroup = report.summary.actions.find((g) => g.action === "update");
      expect(updateGroup?.total).toBe(1);
      expect(report.summary.actions.find((g) => g.action === "create")).toBeUndefined();
      expect(report.summary.failures).toEqual([]);
    });

    it("summary is zero for all-phantom apply", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.phantom", ["update"], {
            before: { id: "1", triggers_replace: null },
            after: { id: "1", triggers_replace: null },
          }),
        ],
      });

      const report = buildApplyReport(plan, makeScanResult());
      expect(report.summary).toEqual({ actions: [], failures: [] });
    });
  });

  describe("known after apply replacement", () => {
    it("replaces (known after apply) with (value not in plan) in attributes", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.deferred", ["update"], {
            before: { id: "1", triggers_replace: null },
            after: { id: null, triggers_replace: null },
            after_unknown: { id: true },
          }),
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          { address: "null_resource.deferred", action: "update", success: true },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      const resource = report.resources?.[0];
      expect(resource).toBeDefined();

      const idAttr = resource?.attributes.find((a) => a.name === "id");
      expect(idAttr?.after).toBe(VALUE_NOT_IN_PLAN);
      // isKnownAfterApply stays true — it's still a placeholder, just with a different label
      expect(idAttr?.isKnownAfterApply).toBe(true);
    });

    it("replaces (known after apply) in outputs", () => {
      const plan = makePlan({
        resource_changes: [],
        output_changes: outputChange("test_out", ["create"], null, null, {
          afterUnknown: true,
        }),
      });

      // Need at least one applied resource for the report to make sense,
      // but outputs are independent of resource filtering
      const report = buildApplyReport(plan, makeScanResult());

      const output = report.outputs.find((o) => o.name === "test_out");
      expect(output?.after).toBe(VALUE_NOT_IN_PLAN);
    });

    it("does not modify non-sentinel attribute values", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.normal", ["update"], {
            before: { id: "1", triggers_replace: null },
            after: { id: "2", triggers_replace: null },
          }),
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          { address: "null_resource.normal", action: "update", success: true },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      const idAttr = report.resources?.[0]?.attributes.find(
        (a) => a.name === "id",
      );
      expect(idAttr?.before).toBe("1");
      expect(idAttr?.after).toBe("2");
    });
  });

  describe("diagnostic extraction", () => {
    it("extracts error diagnostics from scan result", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.failing", ["delete", "create"], {
            before: { id: "1", triggers_replace: null },
            after: { id: "1", triggers_replace: null },
          }),
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          { address: "null_resource.failing", action: "create", success: false },
        ],
        diagnostics: [
          {
            severity: "error",
            summary: "provisioner error",
            detail: "exit status 1",
            address: "null_resource.failing",
          },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      expect(report.diagnostics).toBeDefined();
      expect(report.diagnostics).toHaveLength(1);
      expect(report.diagnostics?.[0]?.severity).toBe("error");
      expect(report.diagnostics?.[0]?.summary).toBe("provisioner error");
      expect(report.diagnostics?.[0]?.detail).toBe("exit status 1");
      expect(report.diagnostics?.[0]?.address).toBe("null_resource.failing");
      expect(report.diagnostics?.[0]?.source).toBe("apply");
    });

    it("extracts warning diagnostics", () => {
      const plan = makePlan();

      const scanResult = makeScanResult({
        diagnostics: [
          { severity: "warning", summary: "deprecated attribute", detail: "Use xyz instead" },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      expect(report.diagnostics).toBeDefined();
      expect(report.diagnostics).toHaveLength(1);
      expect(report.diagnostics?.[0]?.severity).toBe("warning");
      expect(report.diagnostics?.[0]?.source).toBe("apply");
    });

    it("omits diagnostics field when no diagnostics present", () => {
      const plan = makePlan();
      const report = buildApplyReport(plan, makeScanResult());
      expect(report.diagnostics).toBeUndefined();
    });

    it("preserves diagnostics without address", () => {
      const plan = makePlan();

      const scanResult = makeScanResult({
        diagnostics: [
          { severity: "warning", summary: "general warning", detail: "" },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      expect(report.diagnostics?.[0]?.address).toBeUndefined();
      expect(report.diagnostics?.[0]?.source).toBe("apply");
    });
  });

  describe("apply status extraction", () => {
    it("passes through success statuses from scan result", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.web", ["create"]),
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          {
            address: "null_resource.web",
            action: "create",
            success: true,
            elapsed: 1.5,
            idKey: "id",
            idValue: "abc123",
          },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      expect(report.applyStatuses).toBeDefined();
      expect(report.applyStatuses).toHaveLength(1);

      const status = report.applyStatuses?.[0];
      expect(status?.address).toBe("null_resource.web");
      expect(status?.action).toBe("create");
      expect(status?.success).toBe(true);
      expect(status?.elapsed).toBe(1.5);
      expect(status?.idKey).toBe("id");
      expect(status?.idValue).toBe("abc123");
    });

    it("passes through failure statuses from scan result", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.failing", ["delete", "create"], {
            before: { id: "1", triggers_replace: null },
            after: { id: "1", triggers_replace: null },
          }),
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          { address: "null_resource.failing", action: "create", success: false, elapsed: 2.0 },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      expect(report.applyStatuses).toHaveLength(1);

      const status = report.applyStatuses?.[0];
      expect(status?.success).toBe(false);
      expect(status?.action).toBe("create");
      expect(status?.elapsed).toBe(2.0);
    });

    it("omits applyStatuses field when no apply hooks present", () => {
      const plan = makePlan();
      const report = buildApplyReport(plan, makeScanResult());
      expect(report.applyStatuses).toBeUndefined();
    });

    it("preserves no-op action from scan result", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.noop", ["no-op"], {
            before: { id: "1", triggers_replace: null },
            after: { id: "1", triggers_replace: null },
          }),
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          { address: "null_resource.noop", action: "no-op", success: true },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      expect(report.applyStatuses?.[0]?.action).toBe("no-op");
    });
  });

  describe("output resolution", () => {
    it("resolves non-sensitive output values from JSONL", () => {
      const plan = makePlan({
        output_changes: outputChange("result", ["create"], null, null, {
          afterUnknown: true,
        }),
      });

      const scanResult = makeScanResult({
        outputsMessage: makeOutputsMessage({
          result: { sensitive: false, value: "resolved_value" },
        }),
      });

      const report = buildApplyReport(plan, scanResult);
      const output = report.outputs.find((o) => o.name === "result");
      expect(output?.after).toBe("resolved_value");
    });

    it("resolves complex output values as JSON", () => {
      const plan = makePlan({
        output_changes: outputChange("data", ["create"], null, null, {
          afterUnknown: true,
        }),
      });

      const scanResult = makeScanResult({
        outputsMessage: makeOutputsMessage({
          data: { sensitive: false, value: { key: "val" } },
        }),
      });

      const report = buildApplyReport(plan, scanResult);
      const output = report.outputs.find((o) => o.name === "data");
      expect(output?.after).toBe('{\n  "key": "val"\n}');
    });

    it("does NOT resolve sensitive outputs (security invariant)", () => {
      const plan = makePlan({
        output_changes: outputChange("secret", ["create"], null, null, {
          afterUnknown: true,
          sensitive: true,
        }),
      });

      const scanResult = makeScanResult({
        outputsMessage: makeOutputsMessage({
          secret: { sensitive: true, value: "leaked_secret" },
        }),
      });

      const report = buildApplyReport(plan, scanResult);
      const output = report.outputs.find((o) => o.name === "secret");
      // Must not contain the sensitive value
      expect(output?.after).not.toBe("leaked_secret");
      expect(output?.isSensitive).toBe(true);
    });

    it("does NOT resolve when JSONL marks output as sensitive even if plan doesn't", () => {
      const plan = makePlan({
        output_changes: outputChange("sneaky", ["create"], null, null, {
          afterUnknown: true,
          sensitive: false,
        }),
      });

      const scanResult = makeScanResult({
        outputsMessage: makeOutputsMessage({
          sneaky: { sensitive: true, value: "secret_value" },
        }),
      });

      const report = buildApplyReport(plan, scanResult);
      const output = report.outputs.find((o) => o.name === "sneaky");
      expect(output?.after).not.toBe("secret_value");
    });

    it("leaves already-known output values unchanged", () => {
      const plan = makePlan({
        output_changes: outputChange("known", ["update"], "before_val", "after_val"),
      });

      const scanResult = makeScanResult({
        outputsMessage: makeOutputsMessage({
          known: { sensitive: false, value: "resolved_val" },
        }),
      });

      const report = buildApplyReport(plan, scanResult);
      const output = report.outputs.find((o) => o.name === "known");
      // after_val was already a concrete value, not a sentinel — should not be replaced
      expect(output?.after).toBe("after_val");
    });

    it("handles missing outputs message gracefully", () => {
      const plan = makePlan({
        output_changes: outputChange("test", ["create"], null, null, {
          afterUnknown: true,
        }),
      });

      const report = buildApplyReport(plan, makeScanResult());
      const output = report.outputs.find((o) => o.name === "test");
      // With no outputs message, sentinel was already replaced by replaceKnownAfterApply
      expect(output?.after).toBe(VALUE_NOT_IN_PLAN);
    });
  });

  describe("empty and edge cases", () => {
    it("handles empty scan result", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.x", ["create"]),
        ],
      });

      const report = buildApplyReport(plan, makeScanResult());
      expect(report.resources!).toHaveLength(0);
      expect(report.summary).toEqual({ actions: [], failures: [] });
      expect(report.diagnostics).toBeUndefined();
      expect(report.applyStatuses).toBeUndefined();
    });

    it("handles plan with no resource changes", () => {
      const plan = makePlan();
      const report = buildApplyReport(plan, makeScanResult());
      expect(report.resources!).toHaveLength(0);
      expect(report.summary).toEqual({ actions: [], failures: [] });
    });

    it("preserves plan metadata", () => {
      const plan = makePlan({
        terraform_version: "1.9.0",
        timestamp: "2024-01-01T00:00:00Z",
      });
      const report = buildApplyReport(plan, makeScanResult());
      expect(report.toolVersion).toBe("1.9.0");
      expect(report.formatVersion).toBe("1.2");
      expect(report.timestamp).toBe("2024-01-01T00:00:00Z");
    });

    it("handles scan result with unknown type lines gracefully", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.ok", ["create"]),
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          { address: "null_resource.ok", action: "create", success: true },
        ],
        unknownTypeLines: 1,
        totalLines: 3,
        parsedLines: 2,
      });

      const report = buildApplyReport(plan, scanResult);
      const allAddresses = report.resources!.map((r) => r.address);
      expect(allAddresses).toContain("null_resource.ok");
    });
  });

  describe("replace sequence handling", () => {
    it("handles replace as delete + create with final status", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.replaced", ["delete", "create"], {
            before: { id: "old", triggers_replace: null },
            after: { id: null, triggers_replace: null },
            after_unknown: { id: true },
          }),
        ],
      });

      // Scanner consolidates the delete+create sequence into the final status
      const scanResult = makeScanResult({
        applyStatuses: [
          {
            address: "null_resource.replaced",
            action: "create",
            success: true,
            elapsed: 0.3,
            idKey: "id",
            idValue: "new123",
          },
        ],
      });

      const report = buildApplyReport(plan, scanResult);

      // Resource should be present (not phantom)
      const allAddresses = report.resources!.map((r) => r.address);
      expect(allAddresses).toContain("null_resource.replaced");

      // Final status should reflect the create (last outcome)
      const status = report.applyStatuses?.find(
        (s) => s.address === "null_resource.replaced",
      );
      expect(status?.action).toBe("create");
      expect(status?.success).toBe(true);
      expect(status?.idKey).toBe("id");
      expect(status?.idValue).toBe("new123");
    });
  });

  describe("planned_change: not-started detection", () => {
    it("creates not-started statuses for resources that were planned but never applied", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.a", ["create"]),
          resourceChange("null_resource.b", ["create"]),
          resourceChange("null_resource.c", ["create"]),
        ],
      });

      const scanResult = makeScanResult({
        plannedChanges: [
          { address: "null_resource.a", resourceType: "null_resource", module: "", action: "create" },
          { address: "null_resource.b", resourceType: "null_resource", module: "", action: "create" },
          { address: "null_resource.c", resourceType: "null_resource", module: "", action: "create" },
        ],
        applyStatuses: [
          { address: "null_resource.a", action: "create", success: true },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      const statuses = report.applyStatuses!;

      // a was completed
      const statusA = statuses.find((s) => s.address === "null_resource.a");
      expect(statusA?.success).toBe(true);

      // b and c are "not started"
      const statusB = statuses.find((s) => s.address === "null_resource.b");
      expect(statusB).toBeDefined();
      expect(statusB?.success).toBe(false);
      expect(statusB?.action).toBe("create");
      expect(statusB?.elapsed).toBeUndefined();

      const statusC = statuses.find((s) => s.address === "null_resource.c");
      expect(statusC).toBeDefined();
      expect(statusC?.success).toBe(false);
    });

    it("does not create not-started statuses when all planned resources were applied", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.a", ["create"]),
        ],
      });

      const scanResult = makeScanResult({
        plannedChanges: [
          { address: "null_resource.a", resourceType: "null_resource", module: "", action: "create" },
        ],
        applyStatuses: [
          { address: "null_resource.a", action: "create", success: true },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      const statuses = report.applyStatuses!;
      expect(statuses).toHaveLength(1);
      expect(statuses[0]!.success).toBe(true);
    });

    it("does not create not-started for errored resources (they were started)", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.fail", ["create"]),
        ],
      });

      const scanResult = makeScanResult({
        plannedChanges: [
          { address: "null_resource.fail", resourceType: "null_resource", module: "", action: "create" },
        ],
        applyStatuses: [
          { address: "null_resource.fail", action: "create", success: false, elapsed: 1.0 },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      const statuses = report.applyStatuses!;
      expect(statuses).toHaveLength(1);
      expect(statuses[0]!.address).toBe("null_resource.fail");
      expect(statuses[0]!.success).toBe(false);
      // Should have elapsed time (from apply_errored), not a "not started" entry
      expect(statuses[0]!.elapsed).toBeDefined();
    });

    it("handles apply with no planned_change entries", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.a", ["create"]),
        ],
      });

      const scanResult = makeScanResult({
        applyStatuses: [
          { address: "null_resource.a", action: "create", success: true },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      const statuses = report.applyStatuses!;
      expect(statuses).toHaveLength(1);
      expect(statuses[0]!.success).toBe(true);
    });

    it("preserves correct action for not-started resources", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.del", ["delete"]),
        ],
      });

      const scanResult = makeScanResult({
        plannedChanges: [
          { address: "null_resource.del", resourceType: "null_resource", module: "", action: "delete" },
        ],
      });

      const report = buildApplyReport(plan, scanResult);
      const statuses = report.applyStatuses!;
      expect(statuses).toHaveLength(1);
      expect(statuses[0]!.address).toBe("null_resource.del");
      expect(statuses[0]!.action).toBe("delete");
      expect(statuses[0]!.success).toBe(false);
    });
  });

  describe("state-only operations", () => {
    describe("forget", () => {
      it("retains forgotten resource in the report (survives phantom filter)", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("null_resource.ephemeral", ["forget"], {
              before: { id: "123", triggers: { version: "1" } },
              after: null,
            }),
          ],
        });

        const scanResult = makeScanResult({
          plannedChanges: [
            { address: "null_resource.ephemeral", resourceType: "null_resource", module: "", action: "forget" },
          ],
        });

        const report = buildApplyReport(plan, scanResult);
        const allAddresses = report.resources!.map((r) => r.address);
        expect(allAddresses).toContain("null_resource.ephemeral");
      });

      it("is detected from the plan JSON alone, without any JSONL planned_change", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("null_resource.ephemeral", ["forget"], {
              before: { id: "123", triggers: { version: "1" } },
              after: null,
            }),
          ],
        });

        // No planned changes in scan result — detection must come from plan JSON
        const report = buildApplyReport(plan, makeScanResult());
        const allAddresses = report.resources!.map((r) => r.address);
        expect(allAddresses).toContain("null_resource.ephemeral");
      });

      it("shows forgotten resource under the 'forget' action in the summary", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("null_resource.ephemeral", ["forget"], {
              before: { id: "123", triggers: { version: "1" } },
              after: null,
            }),
          ],
        });

        const scanResult = makeScanResult({
          plannedChanges: [
            { address: "null_resource.ephemeral", resourceType: "null_resource", module: "", action: "forget" },
          ],
        });

        const report = buildApplyReport(plan, scanResult);
        const forgetGroup = report.summary.actions.find((g) => g.action === "forget");
        expect(forgetGroup).toBeDefined();
        expect(forgetGroup!.total).toBe(1);
      });

      it("creates a successful ApplyStatus with action 'forget' for the forgotten resource", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("null_resource.ephemeral", ["forget"], {
              before: { id: "123", triggers: { version: "1" } },
              after: null,
            }),
          ],
        });

        const scanResult = makeScanResult({
          plannedChanges: [
            { address: "null_resource.ephemeral", resourceType: "null_resource", module: "", action: "forget" },
          ],
        });

        const report = buildApplyReport(plan, scanResult);
        const statuses = report.applyStatuses ?? [];
        const forgetStatus = statuses.find((s) => s.address === "null_resource.ephemeral");
        expect(forgetStatus).toBeDefined();
        expect(forgetStatus!.action).toBe("forget");
        expect(forgetStatus!.success).toBe(true);
      });

      it("does not create a 'not-started' status for a forgotten resource", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("null_resource.ephemeral", ["forget"], {
              before: { id: "123", triggers: { version: "1" } },
              after: null,
            }),
          ],
        });

        const scanResult = makeScanResult({
          plannedChanges: [
            { address: "null_resource.ephemeral", resourceType: "null_resource", module: "", action: "forget" },
          ],
        });

        const report = buildApplyReport(plan, scanResult);
        const statuses = report.applyStatuses ?? [];
        expect(statuses).toHaveLength(1);
        expect(statuses[0]!.success).toBe(true);
      });
    });

    describe("move", () => {
      it("retains moved resource in the report (survives phantom filter)", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("null_resource.renamed", ["no-op"], {
              before: { id: "123" },
              after: { id: "123" },
              previous_address: "null_resource.original",
            }),
          ],
        });

        const report = buildApplyReport(plan, makeScanResult());
        const allAddresses = report.resources!.map((r) => r.address);
        expect(allAddresses).toContain("null_resource.renamed");
      });

      it("shows moved resource under the 'move' action in the summary", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("null_resource.renamed", ["no-op"], {
              before: { id: "123" },
              after: { id: "123" },
              previous_address: "null_resource.original",
            }),
          ],
        });

        const report = buildApplyReport(plan, makeScanResult());
        const moveGroup = report.summary.actions.find((g) => g.action === "move");
        expect(moveGroup).toBeDefined();
        expect(moveGroup!.total).toBe(1);
      });

      it("creates a successful ApplyStatus with action 'move' for the moved resource", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("null_resource.renamed", ["no-op"], {
              before: { id: "123" },
              after: { id: "123" },
              previous_address: "null_resource.original",
            }),
          ],
        });

        const report = buildApplyReport(plan, makeScanResult());
        const statuses = report.applyStatuses ?? [];
        const moveStatus = statuses.find((s) => s.address === "null_resource.renamed");
        expect(moveStatus).toBeDefined();
        expect(moveStatus!.action).toBe("move");
        expect(moveStatus!.success).toBe(true);
      });

      it("does not create a 'not-started' status for a moved resource", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("null_resource.renamed", ["no-op"], {
              before: { id: "123" },
              after: { id: "123" },
              previous_address: "null_resource.original",
            }),
          ],
        });

        const report = buildApplyReport(plan, makeScanResult());
        const statuses = report.applyStatuses ?? [];
        expect(statuses).toHaveLength(1);
        expect(statuses[0]!.success).toBe(true);
      });
    });

    describe("import (state-only, no attribute changes)", () => {
      it("retains imported resource in the report (survives phantom filter)", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("random_string.imported", ["no-op"], {
              before: { id: "fixedval" },
              after: { id: "fixedval" },
              importing: { id: "fixedval" },
            }),
          ],
        });

        const report = buildApplyReport(plan, makeScanResult());
        const allAddresses = report.resources!.map((r) => r.address);
        expect(allAddresses).toContain("random_string.imported");
      });

      it("shows imported resource under the 'import' action in the summary", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("random_string.imported", ["no-op"], {
              before: { id: "fixedval" },
              after: { id: "fixedval" },
              importing: { id: "fixedval" },
            }),
          ],
        });

        const report = buildApplyReport(plan, makeScanResult());
        const importGroup = report.summary.actions.find((g) => g.action === "import");
        expect(importGroup).toBeDefined();
        expect(importGroup!.total).toBe(1);
      });

      it("creates a successful ApplyStatus with action 'import' for the imported resource", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("random_string.imported", ["no-op"], {
              before: { id: "fixedval" },
              after: { id: "fixedval" },
              importing: { id: "fixedval" },
            }),
          ],
        });

        const report = buildApplyReport(plan, makeScanResult());
        const statuses = report.applyStatuses ?? [];
        const importStatus = statuses.find((s) => s.address === "random_string.imported");
        expect(importStatus).toBeDefined();
        expect(importStatus!.action).toBe("import");
        expect(importStatus!.success).toBe(true);
      });

      it("does not create a 'not-started' status for an imported resource", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("random_string.imported", ["no-op"], {
              before: { id: "fixedval" },
              after: { id: "fixedval" },
              importing: { id: "fixedval" },
            }),
          ],
        });

        const report = buildApplyReport(plan, makeScanResult());
        const statuses = report.applyStatuses ?? [];
        expect(statuses).toHaveLength(1);
        expect(statuses[0]!.success).toBe(true);
      });
    });

    describe("mixed: forget + move + import + regular apply", () => {
      it("all state-only and hook-based resources appear with correct statuses", () => {
        const plan = makePlan({
          resource_changes: [
            resourceChange("null_resource.forgotten", ["forget"], {
              before: { id: "1" },
              after: null,
            }),
            resourceChange("null_resource.renamed", ["no-op"], {
              before: { id: "2" },
              after: { id: "2" },
              previous_address: "null_resource.original",
            }),
            resourceChange("random_string.imported", ["no-op"], {
              before: { id: "fixedval" },
              after: { id: "fixedval" },
              importing: { id: "fixedval" },
            }),
            resourceChange("null_resource.created", ["create"], {
              before: null,
              after: { id: null },
            }),
          ],
        });

        const scanResult = makeScanResult({
          plannedChanges: [
            { address: "null_resource.forgotten", resourceType: "null_resource", module: "", action: "forget" },
          ],
          applyStatuses: [
            { address: "null_resource.created", action: "create", success: true, elapsed: 0.1, idKey: "id", idValue: "new-id" },
          ],
        });

        const report = buildApplyReport(plan, scanResult);
        const allAddresses = report.resources!.map((r) => r.address);
        expect(allAddresses).toContain("null_resource.forgotten");
        expect(allAddresses).toContain("null_resource.renamed");
        expect(allAddresses).toContain("random_string.imported");
        expect(allAddresses).toContain("null_resource.created");

        const statuses = report.applyStatuses ?? [];
        expect(statuses.find((s) => s.address === "null_resource.forgotten")?.action).toBe("forget");
        expect(statuses.find((s) => s.address === "null_resource.renamed")?.action).toBe("move");
        expect(statuses.find((s) => s.address === "random_string.imported")?.action).toBe("import");
        expect(statuses.every((s) => s.success)).toBe(true);
      });
    });
  });
});
