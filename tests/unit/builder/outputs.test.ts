import { describe, it, expect } from "vitest";
import { buildOutputChanges } from "../../../src/builder/outputs.js";
import type { Plan } from "../../../src/tfjson/plan.js";

function makePlan(outputChanges: Plan["output_changes"]): Plan {
  return {
    format_version: "1.2",
    resource_changes: [],
    output_changes: outputChanges,
  } as Plan;
}

describe("buildOutputChanges", () => {
  it("returns empty array when output_changes is missing", () => {
    const plan = makePlan(undefined);
    expect(buildOutputChanges(plan)).toEqual([]);
  });

  it("returns empty array when output_changes is empty", () => {
    const plan = makePlan({});
    expect(buildOutputChanges(plan)).toEqual([]);
  });

  it("maps a create output change", () => {
    const plan = makePlan({
      greeting: {
        actions: ["create"],
        before: null,
        after: "hello world",
        before_sensitive: false,
        after_sensitive: false,
      },
    });
    const result = buildOutputChanges(plan);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("greeting");
    expect(result[0]!.action).toBe("create");
    expect(result[0]!.before).toBe(null);
    expect(result[0]!.after).toBe("hello world");
    expect(result[0]!.isSensitive).toBe(false);
  });

  it("maps a delete output change", () => {
    const plan = makePlan({
      old_output: {
        actions: ["delete"],
        before: "old value",
        after: null,
        before_sensitive: false,
        after_sensitive: false,
      },
    });
    const result = buildOutputChanges(plan);
    expect(result[0]!.action).toBe("delete");
    expect(result[0]!.before).toBe("old value");
    expect(result[0]!.after).toBe(null);
  });

  it("masks sensitive output values", () => {
    const plan = makePlan({
      secret: {
        actions: ["update"],
        before: "old_secret",
        after: "new_secret",
        before_sensitive: true,
        after_sensitive: true,
      },
    });
    const result = buildOutputChanges(plan);
    expect(result[0]!.isSensitive).toBe(true);
    expect(result[0]!.before).toBe(null);
    expect(result[0]!.after).toBe(null);
  });

  it("masks when before_sensitive is true but after_sensitive is false", () => {
    const plan = makePlan({
      partial: {
        actions: ["update"],
        before: "was_secret",
        after: "now_public",
        before_sensitive: true,
        after_sensitive: false,
      },
    });
    const result = buildOutputChanges(plan);
    expect(result[0]!.isSensitive).toBe(true);
    expect(result[0]!.before).toBe(null);
  });

  it("converts boolean output values to strings", () => {
    const plan = makePlan({
      flag: {
        actions: ["create"],
        before: null,
        after: true,
        before_sensitive: false,
        after_sensitive: false,
      },
    });
    const result = buildOutputChanges(plan);
    expect(result[0]!.after).toBe("true");
  });

  it("converts numeric output values to strings", () => {
    const plan = makePlan({
      count: {
        actions: ["create"],
        before: null,
        after: 42,
        before_sensitive: false,
        after_sensitive: false,
      },
    });
    const result = buildOutputChanges(plan);
    expect(result[0]!.after).toBe("42");
  });

  it("pretty-prints object output values", () => {
    const plan = makePlan({
      config: {
        actions: ["create"],
        before: null,
        after: { key: "value" },
        before_sensitive: false,
        after_sensitive: false,
      },
    });
    const result = buildOutputChanges(plan);
    expect(result[0]!.after).toContain("key");
  });
});
