import { describe, it, expect } from "vitest";
import { enrichReportFromState } from "../../../src/builder/state-enrichment.js";
import type { Report } from "../../../src/model/report.js";
import type { ResourceChange } from "../../../src/model/resource.js";
import type { OutputChange } from "../../../src/model/output.js";
import type { AttributeChange } from "../../../src/model/attribute.js";
import type { State } from "../../../src/tfjson/state.js";
import { SENSITIVE_MASK, VALUE_NOT_IN_PLAN } from "../../../src/model/sentinels.js";

/** Create a minimal Report with the given resources and outputs. */
function makeReport(
  resources?: ResourceChange[],
  outputs?: OutputChange[],
): Report {
  return {
    title: "test",
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: [],
    resources,
    outputs,
  };
}

/** Create an attribute with isKnownAfterApply = true. */
function unknownAttr(name: string, overrides?: Partial<AttributeChange>): AttributeChange {
  return {
    name,
    before: null,
    after: VALUE_NOT_IN_PLAN,
    isSensitive: false,
    isLarge: false,
    isKnownAfterApply: true,
    ...overrides,
  };
}

/** Create an attribute with a known value. */
function knownAttr(name: string, after: string | null): AttributeChange {
  return {
    name,
    before: null,
    after,
    isSensitive: false,
    isLarge: false,
    isKnownAfterApply: false,
  };
}

/** Create a resource with hasAttributeDetail = true. */
function makeResource(
  address: string,
  attributes: AttributeChange[],
  overrides?: Partial<ResourceChange>,
): ResourceChange {
  return {
    address,
    type: "null_resource",
    action: "create",
    actionReason: null,
    attributes,
    hasAttributeDetail: true,
    importId: null,
    movedFromAddress: null,
    allUnknownAfterApply: true,
    ...overrides,
  };
}

/** Create a minimal State with resources and outputs. */
function makeState(
  resources: {
    address: string;
    values?: Record<string, unknown>;
    sensitive_values?: Record<string, unknown>;
  }[],
  outputs?: Record<string, { value?: unknown; sensitive: boolean }>,
): State {
  return {
    format_version: "1.0",
    values: {
      root_module: {
        resources: resources.map((r) => ({
          address: r.address,
          provider_name: "registry.opentofu.org/hashicorp/null",
          schema_version: 0,
          values: r.values,
          sensitive_values: r.sensitive_values,
        })),
      },
      outputs,
    },
  };
}

/** Create a state with no resources (empty). */
function emptyState(): State {
  return {
    format_version: "1.0",
  };
}

describe("enrichReportFromState", () => {
  it("resolves unknown attributes from state values", () => {
    const attr = unknownAttr("id");
    const resource = makeResource("null_resource.test", [attr]);
    const report = makeReport([resource]);
    const state = makeState([
      { address: "null_resource.test", values: { id: "abc-123" } },
    ]);

    enrichReportFromState(report, state);

    expect(attr.after).toBe("abc-123");
    expect(attr.isKnownAfterApply).toBe(false);
    expect(report.stateEnriched).toBe(true);
  });

  it("masks attributes discovered as sensitive in state", () => {
    const attr = unknownAttr("secret");
    const resource = makeResource("null_resource.test", [attr]);
    const report = makeReport([resource]);
    const state = makeState([
      {
        address: "null_resource.test",
        values: { secret: "s3cr3t" },
        sensitive_values: { secret: true },
      },
    ]);

    enrichReportFromState(report, state);

    expect(attr.after).toBe(SENSITIVE_MASK);
    expect(attr.isSensitive).toBe(true);
    expect(attr.isKnownAfterApply).toBe(false);
  });

  it("skips attributes already marked sensitive from plan", () => {
    const attr = unknownAttr("password", {
      isSensitive: true,
      after: SENSITIVE_MASK,
    });
    const resource = makeResource("null_resource.test", [attr]);
    const report = makeReport([resource]);
    const state = makeState([
      {
        address: "null_resource.test",
        values: { password: "real-password" },
      },
    ]);

    enrichReportFromState(report, state);

    // Should stay masked — never reveal
    expect(attr.after).toBe(SENSITIVE_MASK);
    expect(attr.isSensitive).toBe(true);
  });

  it("does not touch attributes that are not isKnownAfterApply", () => {
    const attr = knownAttr("name", "hello");
    const resource = makeResource("null_resource.test", [attr]);
    const report = makeReport([resource]);
    const state = makeState([
      {
        address: "null_resource.test",
        values: { name: "different" },
      },
    ]);

    enrichReportFromState(report, state);

    expect(attr.after).toBe("hello");
  });

  it("clears allUnknownAfterApply for resources found in state", () => {
    const resource = makeResource("null_resource.test", [unknownAttr("id")], {
      allUnknownAfterApply: true,
    });
    const report = makeReport([resource]);
    const state = makeState([
      { address: "null_resource.test", values: { id: "123" } },
    ]);

    enrichReportFromState(report, state);

    expect(resource.allUnknownAfterApply).toBe(false);
  });

  it("clears allUnknownAfterApply for resources NOT in state (destroyed/moved)", () => {
    const resource = makeResource("null_resource.gone", [unknownAttr("id")], {
      allUnknownAfterApply: true,
    });
    const report = makeReport([resource]);
    // State has no matching resource
    const state = makeState([]);

    enrichReportFromState(report, state);

    expect(resource.allUnknownAfterApply).toBe(false);
  });

  it("is a no-op on empty state (no values)", () => {
    const resource = makeResource("null_resource.test", [unknownAttr("id")], {
      allUnknownAfterApply: true,
    });
    const report = makeReport([resource]);
    const state = emptyState();

    enrichReportFromState(report, state);

    // Everything untouched
    expect(resource.allUnknownAfterApply).toBe(true);
    expect(resource.attributes[0]!.isKnownAfterApply).toBe(true);
    expect(report.stateEnriched).toBeUndefined();
  });

  it("handles mixed resolution: some resolved, some masked as sensitive", () => {
    const idAttr = unknownAttr("id");
    const secretAttr = unknownAttr("secret_key");
    const missingAttr = unknownAttr("computed_field");
    const resource = makeResource("null_resource.test", [
      idAttr,
      secretAttr,
      missingAttr,
    ]);
    const report = makeReport([resource]);
    const state = makeState([
      {
        address: "null_resource.test",
        values: { id: "xyz", secret_key: "s3cr3t" },
        sensitive_values: { secret_key: true },
      },
    ]);

    enrichReportFromState(report, state);

    // id resolved
    expect(idAttr.after).toBe("xyz");
    expect(idAttr.isKnownAfterApply).toBe(false);

    // secret_key masked
    expect(secretAttr.after).toBe(SENSITIVE_MASK);
    expect(secretAttr.isSensitive).toBe(true);
    expect(secretAttr.isKnownAfterApply).toBe(false);

    // computed_field not in state — stays as sentinel
    expect(missingAttr.isKnownAfterApply).toBe(true);

    // allUnknownAfterApply cleared for all resources
    expect(resource.allUnknownAfterApply).toBe(false);

    expect(report.stateEnriched).toBe(true);
  });

  it("sets isLarge for resolved values that look structured", () => {
    const attr = unknownAttr("config");
    const resource = makeResource("null_resource.test", [attr]);
    const report = makeReport([resource]);
    const state = makeState([
      {
        address: "null_resource.test",
        values: { config: '{"key":"value","nested":{"a":"b"}}' },
      },
    ]);

    enrichReportFromState(report, state);

    expect(attr.after).toBe('{"key":"value","nested":{"a":"b"}}');
    expect(attr.isLarge).toBe(true);
  });

  it("resolves output values from state", () => {
    const output: OutputChange = {
      name: "cluster_id",
      action: "create",
      before: null,
      after: VALUE_NOT_IN_PLAN,
      isSensitive: false,
      isKnownAfterApply: true,
    };
    const report = makeReport([], [output]);
    const state = makeState([], {
      cluster_id: { value: "cluster-abc", sensitive: false },
    });

    enrichReportFromState(report, state);

    expect(output.after).toBe("cluster-abc");
    expect(output.isKnownAfterApply).toBe(false);
    expect(report.stateEnriched).toBe(true);
  });

  it("masks sensitive outputs from state", () => {
    const output: OutputChange = {
      name: "db_password",
      action: "create",
      before: null,
      after: VALUE_NOT_IN_PLAN,
      isSensitive: false,
      isKnownAfterApply: true,
    };
    const report = makeReport([], [output]);
    const state = makeState([], {
      db_password: { value: "hunter2", sensitive: true },
    });

    enrichReportFromState(report, state);

    expect(output.after).toBe(SENSITIVE_MASK);
    expect(output.isSensitive).toBe(true);
    expect(output.isKnownAfterApply).toBe(false);
  });

  it("skips resources without hasAttributeDetail", () => {
    const attr = unknownAttr("id");
    const resource = makeResource("null_resource.test", [attr], {
      hasAttributeDetail: false,
    });
    const report = makeReport([resource]);
    const state = makeState([
      { address: "null_resource.test", values: { id: "123" } },
    ]);

    enrichReportFromState(report, state);

    // attr unchanged because hasAttributeDetail is false
    expect(attr.isKnownAfterApply).toBe(true);
    expect(attr.after).toBe(VALUE_NOT_IN_PLAN);
  });

  it("handles child modules in state tree", () => {
    const attr = unknownAttr("id");
    const resource = makeResource("module.child.null_resource.test", [attr]);
    const report = makeReport([resource]);

    const state: State = {
      format_version: "1.0",
      values: {
        root_module: {
          child_modules: [
            {
              address: "module.child",
              resources: [
                {
                  address: "module.child.null_resource.test",
                  provider_name: "registry.opentofu.org/hashicorp/null",
                  schema_version: 0,
                  values: { id: "child-id" },
                },
              ],
            },
          ],
        },
      },
    };

    enrichReportFromState(report, state);

    expect(attr.after).toBe("child-id");
    expect(attr.isKnownAfterApply).toBe(false);
  });

  it("stringifies non-string primitive values from state", () => {
    const numAttr = unknownAttr("count");
    const boolAttr = unknownAttr("enabled");
    const resource = makeResource("null_resource.test", [numAttr, boolAttr]);
    const report = makeReport([resource]);
    const state = makeState([
      {
        address: "null_resource.test",
        values: {
          count: 42,
          enabled: true,
        },
      },
    ]);

    enrichReportFromState(report, state);

    expect(numAttr.after).toBe("42");
    expect(boolAttr.after).toBe("true");
  });

  it("does not set stateEnriched when no values were resolved", () => {
    // Resource has no unknown attributes
    const attr = knownAttr("name", "hello");
    const resource = makeResource("null_resource.test", [attr], {
      allUnknownAfterApply: false,
    });
    const report = makeReport([resource]);
    const state = makeState([
      { address: "null_resource.test", values: { name: "hello" } },
    ]);

    enrichReportFromState(report, state);

    expect(report.stateEnriched).toBeUndefined();
  });
});
