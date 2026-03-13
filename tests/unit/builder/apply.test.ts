import { describe, it, expect } from "vitest";
import { buildApplyReport } from "../../../src/builder/apply.js";
import type { Plan } from "../../../src/tfjson/plan.js";
import type { UIMessage, UIDiagnosticMessage } from "../../../src/tfjson/machine-readable-ui.js";
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
  return {
    address,
    mode: "managed",
    type: address.split(".")[0],
    name: address.split(".").slice(1).join("."),
    provider_name: "registry.terraform.io/hashicorp/null",
    change: {
      actions,
      before: null,
      after: null,
      after_unknown: {},
      before_sensitive: {},
      after_sensitive: {},
      ...overrides,
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

function applyStartMsg(addr: string, action = "update"): UIMessage {
  return {
    "@level": "info",
    "@message": `${addr}: Modifying...`,
    "@module": "terraform.ui",
    "@timestamp": "2024-01-01T00:00:00.000Z",
    type: "apply_start",
    hook: {
      resource: {
        addr,
        module: "",
        resource: addr,
        implied_provider: addr.split("_")[0] ?? "",
        resource_type: addr.split(".")[0] ?? "",
        resource_name: addr.split(".").slice(1).join("."),
        resource_key: null,
      },
      action,
    },
  } as UIMessage;
}

function applyCompleteMsg(
  addr: string,
  action = "update",
  elapsed = 0.5,
  idKey?: string,
  idValue?: string,
): UIMessage {
  return {
    "@level": "info",
    "@message": `${addr}: Modifications complete`,
    "@module": "terraform.ui",
    "@timestamp": "2024-01-01T00:00:01.000Z",
    type: "apply_complete",
    hook: {
      resource: {
        addr,
        module: "",
        resource: addr,
        implied_provider: addr.split("_")[0] ?? "",
        resource_type: addr.split(".")[0] ?? "",
        resource_name: addr.split(".").slice(1).join("."),
        resource_key: null,
      },
      action,
      elapsed_seconds: elapsed,
      id_key: idKey,
      id_value: idValue,
    },
  } as UIMessage;
}

function applyErroredMsg(addr: string, action = "create", elapsed = 1.0): UIMessage {
  return {
    "@level": "info",
    "@message": `${addr}: Error`,
    "@module": "terraform.ui",
    "@timestamp": "2024-01-01T00:00:01.000Z",
    type: "apply_errored",
    hook: {
      resource: {
        addr,
        module: "",
        resource: addr,
        implied_provider: addr.split("_")[0] ?? "",
        resource_type: addr.split(".")[0] ?? "",
        resource_name: addr.split(".").slice(1).join("."),
        resource_key: null,
      },
      action,
      elapsed_seconds: elapsed,
    },
  } as UIMessage;
}

function diagnosticMsg(
  severity: "error" | "warning",
  summary: string,
  detail = "",
  address?: string,
): UIMessage {
  return {
    "@level": severity === "error" ? "error" : "warn",
    "@message": summary,
    "@module": "terraform.ui",
    "@timestamp": "2024-01-01T00:00:02.000Z",
    type: "diagnostic",
    diagnostic: {
      severity,
      summary,
      detail,
      ...(address !== undefined ? { address } : {}),
    },
  } as UIMessage;
}

function outputsMsg(
  outputs: Record<string, { sensitive: boolean; value?: unknown }>,
): UIMessage {
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
  } as UIMessage;
}

function versionMsg(): UIMessage {
  return {
    "@level": "info",
    "@message": "Terraform 1.9.0",
    "@module": "terraform.ui",
    "@timestamp": "2024-01-01T00:00:00.000Z",
    type: "version",
    terraform: "1.9.0",
    ui: "1.2",
  } as UIMessage;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("buildApplyReport", () => {
  describe("phantom filtering", () => {
    it("excludes resources that have no apply_start message", () => {
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

      const messages: UIMessage[] = [
        versionMsg(),
        applyStartMsg("null_resource.real"),
        applyCompleteMsg("null_resource.real"),
      ];

      const report = buildApplyReport(plan, messages);

      const allAddresses = report.modules.flatMap((m) =>
        m.resources.map((r) => r.address),
      );
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

      const messages: UIMessage[] = [
        versionMsg(),
        applyStartMsg("null_resource.failing", "delete"),
        applyCompleteMsg("null_resource.failing", "delete"),
        applyStartMsg("null_resource.failing", "create"),
        applyErroredMsg("null_resource.failing", "create"),
      ];

      const report = buildApplyReport(plan, messages);
      const allAddresses = report.modules.flatMap((m) =>
        m.resources.map((r) => r.address),
      );
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

      // No apply_start messages — all resources are phantoms
      const messages: UIMessage[] = [versionMsg()];

      const report = buildApplyReport(plan, messages);
      expect(report.modules).toHaveLength(0);
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

      const messages: UIMessage[] = [
        versionMsg(),
        applyStartMsg("data.local_command.read_config", "read"),
        applyCompleteMsg("data.local_command.read_config", "read"),
      ];

      const report = buildApplyReport(plan, messages);
      const allAddresses = report.modules.flatMap((m) =>
        m.resources.map((r) => r.address),
      );
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

      const messages: UIMessage[] = [
        versionMsg(),
        applyStartMsg("null_resource.keeper", "update"),
        applyCompleteMsg("null_resource.keeper", "update"),
        {
          "@level": "error",
          "@message": "Error reading data source",
          "@module": "tofu.ui",
          "@timestamp": "2025-01-01T00:00:00.000000Z",
          type: "diagnostic",
          diagnostic: {
            severity: "error",
            summary: "Failed to read data source",
            detail: "data.external.failing_query: query returned non-zero exit code",
            address: "data.external.failing_query",
          },
        } satisfies UIDiagnosticMessage,
      ];

      const report = buildApplyReport(plan, messages);

      // Data source must NOT appear in resource changes
      const allAddresses = report.modules.flatMap((m) =>
        m.resources.map((r) => r.address),
      );
      expect(allAddresses).not.toContain("data.external.failing_query");
      // But the managed resource should still be present
      expect(allAddresses).toContain("null_resource.keeper");

      // The data source error MUST appear in diagnostics
      expect(report.diagnostics).toBeDefined();
      expect(report.diagnostics).toHaveLength(1);
      expect(report.diagnostics![0]!.address).toBe("data.external.failing_query");
      expect(report.diagnostics![0]!.severity).toBe("error");
      expect(report.diagnostics![0]!.summary).toBe("Failed to read data source");
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

      const messages: UIMessage[] = [
        versionMsg(),
        applyStartMsg("null_resource.applied"),
        applyCompleteMsg("null_resource.applied"),
      ];

      const report = buildApplyReport(plan, messages);

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

      const messages: UIMessage[] = [versionMsg()];
      const report = buildApplyReport(plan, messages);
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

      const messages: UIMessage[] = [
        versionMsg(),
        applyStartMsg("null_resource.deferred"),
        applyCompleteMsg("null_resource.deferred"),
      ];

      const report = buildApplyReport(plan, messages);
      const resource = report.modules[0]?.resources[0];
      expect(resource).toBeDefined();

      const idAttr = resource?.attributes.find((a) => a.name === "id");
      expect(idAttr?.after).toBe(VALUE_NOT_IN_PLAN);
      expect(idAttr?.isKnownAfterApply).toBe(false);
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
      const messages: UIMessage[] = [versionMsg()];
      const report = buildApplyReport(plan, messages);

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

      const messages: UIMessage[] = [
        versionMsg(),
        applyStartMsg("null_resource.normal"),
        applyCompleteMsg("null_resource.normal"),
      ];

      const report = buildApplyReport(plan, messages);
      const idAttr = report.modules[0]?.resources[0]?.attributes.find(
        (a) => a.name === "id",
      );
      expect(idAttr?.before).toBe("1");
      expect(idAttr?.after).toBe("2");
    });
  });

  describe("diagnostic extraction", () => {
    it("extracts error diagnostics from messages", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.failing", ["delete", "create"], {
            before: { id: "1", triggers_replace: null },
            after: { id: "1", triggers_replace: null },
          }),
        ],
      });

      const messages: UIMessage[] = [
        versionMsg(),
        applyStartMsg("null_resource.failing", "delete"),
        applyCompleteMsg("null_resource.failing", "delete"),
        applyStartMsg("null_resource.failing", "create"),
        applyErroredMsg("null_resource.failing", "create"),
        diagnosticMsg(
          "error",
          "provisioner error",
          "exit status 1",
          "null_resource.failing",
        ),
      ];

      const report = buildApplyReport(plan, messages);
      expect(report.diagnostics).toBeDefined();
      expect(report.diagnostics).toHaveLength(1);
      expect(report.diagnostics?.[0]?.severity).toBe("error");
      expect(report.diagnostics?.[0]?.summary).toBe("provisioner error");
      expect(report.diagnostics?.[0]?.detail).toBe("exit status 1");
      expect(report.diagnostics?.[0]?.address).toBe("null_resource.failing");
    });

    it("extracts warning diagnostics", () => {
      const plan = makePlan();
      const messages: UIMessage[] = [
        versionMsg(),
        diagnosticMsg("warning", "deprecated attribute", "Use xyz instead"),
      ];

      const report = buildApplyReport(plan, messages);
      expect(report.diagnostics).toBeDefined();
      expect(report.diagnostics).toHaveLength(1);
      expect(report.diagnostics?.[0]?.severity).toBe("warning");
    });

    it("omits diagnostics field when no diagnostics present", () => {
      const plan = makePlan();
      const messages: UIMessage[] = [versionMsg()];
      const report = buildApplyReport(plan, messages);
      expect(report.diagnostics).toBeUndefined();
    });

    it("preserves diagnostics without address", () => {
      const plan = makePlan();
      const messages: UIMessage[] = [
        versionMsg(),
        diagnosticMsg("warning", "general warning"),
      ];

      const report = buildApplyReport(plan, messages);
      expect(report.diagnostics?.[0]?.address).toBeUndefined();
    });
  });

  describe("apply status extraction", () => {
    it("builds success statuses from apply_complete messages", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.web", ["create"]),
        ],
      });

      const messages: UIMessage[] = [
        versionMsg(),
        applyStartMsg("null_resource.web", "create"),
        applyCompleteMsg("null_resource.web", "create", 1.5, "id", "abc123"),
      ];

      const report = buildApplyReport(plan, messages);
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

    it("builds failure statuses from apply_errored messages", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.failing", ["delete", "create"], {
            before: { id: "1", triggers_replace: null },
            after: { id: "1", triggers_replace: null },
          }),
        ],
      });

      const messages: UIMessage[] = [
        versionMsg(),
        applyStartMsg("null_resource.failing", "delete"),
        applyCompleteMsg("null_resource.failing", "delete", 0.1),
        applyStartMsg("null_resource.failing", "create"),
        applyErroredMsg("null_resource.failing", "create", 2.0),
      ];

      const report = buildApplyReport(plan, messages);
      expect(report.applyStatuses).toHaveLength(1);

      // Last event wins — the errored create overrides the successful delete
      const status = report.applyStatuses?.[0];
      expect(status?.success).toBe(false);
      expect(status?.action).toBe("create");
      expect(status?.elapsed).toBe(2.0);
    });

    it("omits applyStatuses field when no apply hooks present", () => {
      const plan = makePlan();
      const messages: UIMessage[] = [versionMsg()];
      const report = buildApplyReport(plan, messages);
      expect(report.applyStatuses).toBeUndefined();
    });

    it("maps UI action 'noop' to plan action 'no-op'", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.noop", ["no-op"], {
            before: { id: "1", triggers_replace: null },
            after: { id: "1", triggers_replace: null },
          }),
        ],
      });

      const messages: UIMessage[] = [
        versionMsg(),
        applyStartMsg("null_resource.noop", "noop"),
        applyCompleteMsg("null_resource.noop", "noop"),
      ];

      const report = buildApplyReport(plan, messages);
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

      const messages: UIMessage[] = [
        versionMsg(),
        outputsMsg({
          result: { sensitive: false, value: "resolved_value" },
        }),
      ];

      const report = buildApplyReport(plan, messages);
      const output = report.outputs.find((o) => o.name === "result");
      expect(output?.after).toBe("resolved_value");
    });

    it("resolves complex output values as JSON", () => {
      const plan = makePlan({
        output_changes: outputChange("data", ["create"], null, null, {
          afterUnknown: true,
        }),
      });

      const messages: UIMessage[] = [
        versionMsg(),
        outputsMsg({
          data: { sensitive: false, value: { key: "val" } },
        }),
      ];

      const report = buildApplyReport(plan, messages);
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

      const messages: UIMessage[] = [
        versionMsg(),
        outputsMsg({
          secret: { sensitive: true, value: "leaked_secret" },
        }),
      ];

      const report = buildApplyReport(plan, messages);
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

      const messages: UIMessage[] = [
        versionMsg(),
        outputsMsg({
          sneaky: { sensitive: true, value: "secret_value" },
        }),
      ];

      const report = buildApplyReport(plan, messages);
      const output = report.outputs.find((o) => o.name === "sneaky");
      expect(output?.after).not.toBe("secret_value");
    });

    it("leaves already-known output values unchanged", () => {
      const plan = makePlan({
        output_changes: outputChange("known", ["update"], "before_val", "after_val"),
      });

      const messages: UIMessage[] = [
        versionMsg(),
        outputsMsg({
          known: { sensitive: false, value: "resolved_val" },
        }),
      ];

      const report = buildApplyReport(plan, messages);
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

      const messages: UIMessage[] = [versionMsg()];
      const report = buildApplyReport(plan, messages);
      const output = report.outputs.find((o) => o.name === "test");
      // With no outputs message, sentinel was already replaced by replaceKnownAfterApply
      expect(output?.after).toBe(VALUE_NOT_IN_PLAN);
    });
  });

  describe("empty and edge cases", () => {
    it("handles empty messages array", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.x", ["create"]),
        ],
      });

      const report = buildApplyReport(plan, []);
      expect(report.modules).toHaveLength(0);
      expect(report.summary).toEqual({ actions: [], failures: [] });
      expect(report.diagnostics).toBeUndefined();
      expect(report.applyStatuses).toBeUndefined();
    });

    it("handles plan with no resource changes", () => {
      const plan = makePlan();
      const messages: UIMessage[] = [versionMsg()];
      const report = buildApplyReport(plan, messages);
      expect(report.modules).toHaveLength(0);
      expect(report.summary).toEqual({ actions: [], failures: [] });
    });

    it("preserves plan metadata", () => {
      const plan = makePlan({
        terraform_version: "1.9.0",
        timestamp: "2024-01-01T00:00:00Z",
      });
      const messages: UIMessage[] = [versionMsg()];
      const report = buildApplyReport(plan, messages);
      expect(report.toolVersion).toBe("1.9.0");
      expect(report.formatVersion).toBe("1.2");
      expect(report.timestamp).toBe("2024-01-01T00:00:00Z");
    });

    it("ignores unknown message types gracefully", () => {
      const plan = makePlan({
        resource_changes: [
          resourceChange("null_resource.ok", ["create"]),
        ],
      });

      const messages: UIMessage[] = [
        versionMsg(),
        {
          "@level": "info",
          "@message": "some future message type",
          "@module": "terraform.ui",
          "@timestamp": "2024-01-01T00:00:00.000Z",
          type: "future_type",
        } as UIMessage,
        applyStartMsg("null_resource.ok", "create"),
        applyCompleteMsg("null_resource.ok", "create"),
      ];

      const report = buildApplyReport(plan, messages);
      const allAddresses = report.modules.flatMap((m) =>
        m.resources.map((r) => r.address),
      );
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

      const messages: UIMessage[] = [
        versionMsg(),
        applyStartMsg("null_resource.replaced", "delete"),
        applyCompleteMsg("null_resource.replaced", "delete", 0.1),
        applyStartMsg("null_resource.replaced", "create"),
        applyCompleteMsg("null_resource.replaced", "create", 0.3, "id", "new123"),
      ];

      const report = buildApplyReport(plan, messages);

      // Resource should be present (not phantom)
      const allAddresses = report.modules.flatMap((m) =>
        m.resources.map((r) => r.address),
      );
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
});
