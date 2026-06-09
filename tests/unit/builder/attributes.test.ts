import { describe, it, expect } from "vitest";
import {
  buildAttributeChanges,
  isFlatScalarArray,
} from "../../../src/builder/attributes.js";
import type { Change } from "../../../src/tfjson/plan.js";

function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    actions: ["update"],
    before: null,
    after: null,
    before_sensitive: false,
    after_sensitive: false,
    after_unknown: false,
    ...overrides,
  };
}

describe("buildAttributeChanges", () => {
  it("returns empty array when both before and after are null", () => {
    const result = buildAttributeChanges(
      makeChange({ actions: ["create"] }),
      {},
    );
    expect(result).toEqual([]);
  });

  it("detects simple string change", () => {
    const result = buildAttributeChanges(
      makeChange({ before: { name: "old" }, after: { name: "new" } }),
      {},
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("name");
    expect(result[0]!.before).toBe("old");
    expect(result[0]!.after).toBe("new");
    expect(result[0]!.isSensitive).toBe(false);
  });

  it("skips unchanged attributes by default", () => {
    const result = buildAttributeChanges(
      makeChange({ before: { name: "same" }, after: { name: "same" } }),
      {},
    );
    expect(result).toHaveLength(0);
  });

  it("includes unchanged attributes when showUnchangedAttributes=true", () => {
    const result = buildAttributeChanges(
      makeChange({ before: { name: "same" }, after: { name: "same" } }),
      { showUnchangedAttributes: true },
    );
    expect(result.some((a) => a.name === "name")).toBe(true);
  });

  it("masks sensitive attributes as '(sensitive)'", () => {
    const result = buildAttributeChanges(
      makeChange({
        before: { password: "old_secret" },
        after: { password: "new_secret" },
        before_sensitive: { password: true },
        after_sensitive: { password: true },
      }),
      {},
    );
    const passwordAttr = result.find((a) => a.name === "password");
    expect(passwordAttr).toBeDefined();
    expect(passwordAttr!.before).toBe("(sensitive)");
    expect(passwordAttr!.after).toBe("(sensitive)");
    expect(passwordAttr!.isSensitive).toBe(true);
  });

  it("masks when root before_sensitive is true", () => {
    const result = buildAttributeChanges(
      makeChange({
        before: { secret: "value" },
        after: { secret: "other" },
        before_sensitive: true,
      }),
      {},
    );
    expect(result.every((a) => a.isSensitive)).toBe(true);
  });

  it("marks attributes as known after apply", () => {
    const result = buildAttributeChanges(
      makeChange({
        before: null,
        after: null,
        after_unknown: { id: true },
      }),
      {},
    );
    const idAttr = result.find((a) => a.name === "id");
    expect(idAttr).toBeDefined();
    expect(idAttr!.after).toBe("(known after apply)");
    expect(idAttr!.isKnownAfterApply).toBe(true);
  });

  it("detects large JSON value", () => {
    const largeObj = JSON.stringify({ a: 1, b: 2, c: 3 });
    const result = buildAttributeChanges(
      makeChange({
        before: { data: largeObj },
        after: { data: largeObj + "x" },
      }),
      { showUnchangedAttributes: true },
    );
    const dataAttr = result.find((a) => a.name === "data");
    expect(dataAttr).toBeDefined();
    expect(dataAttr!.isLarge).toBe(true);
  });

  it("detects large multiline value", () => {
    const multiline = "line1\nline2\nline3\nline4\nline5";
    const result = buildAttributeChanges(
      makeChange({
        before: { content: multiline },
        after: { content: multiline + "\nline6" },
      }),
      {},
    );
    const contentAttr = result.find((a) => a.name === "content");
    expect(contentAttr).toBeDefined();
    expect(contentAttr!.isLarge).toBe(true);
  });

  it("returns attributes sorted by name", () => {
    const result = buildAttributeChanges(
      makeChange({
        before: { zebra: "old", apple: "old", mango: "old" },
        after: { zebra: "new", apple: "new", mango: "new" },
      }),
      {},
    );
    const names = result.map((a) => a.name);
    expect(names).toEqual([...names].sort());
  });

  it("handles attribute added (before null, after present)", () => {
    const result = buildAttributeChanges(
      makeChange({ before: {}, after: { new_key: "value" } }),
      {},
    );
    const attr = result.find((a) => a.name === "new_key");
    expect(attr).toBeDefined();
    expect(attr!.before).toBe(null);
    expect(attr!.after).toBe("value");
  });

  it("handles attribute removed (before present, after null)", () => {
    const result = buildAttributeChanges(
      makeChange({ before: { old_key: "value" }, after: {} }),
      {},
    );
    const attr = result.find((a) => a.name === "old_key");
    expect(attr).toBeDefined();
    expect(attr!.before).toBe("value");
    expect(attr!.after).toBe(null);
  });

  it("flattens nested attribute paths", () => {
    const result = buildAttributeChanges(
      makeChange({
        before: { tags: { env: "staging" } },
        after: { tags: { env: "prod" } },
      }),
      {},
    );
    const attr = result.find((a) => a.name === "tags.env");
    expect(attr).toBeDefined();
    expect(attr!.before).toBe("staging");
    expect(attr!.after).toBe("prod");
  });
});

describe("isFlatScalarArray", () => {
  it("returns true for array of 4+ strings", () => {
    expect(isFlatScalarArray(["a", "b", "c", "d"])).toBe(true);
  });

  it("returns true for array of numbers", () => {
    expect(isFlatScalarArray([1, 2, 3, 4])).toBe(true);
  });

  it("returns true for array of booleans", () => {
    expect(isFlatScalarArray([true, false, true, false])).toBe(true);
  });

  it("returns true for mixed scalar types", () => {
    expect(isFlatScalarArray(["a", 1, true, "b"])).toBe(true);
  });

  it("returns false for small arrays (< 4 elements)", () => {
    expect(isFlatScalarArray(["a", "b", "c"])).toBe(false);
  });

  it("returns false for arrays with null elements", () => {
    expect(isFlatScalarArray(["a", null, "c", "d"])).toBe(false);
  });

  it("returns false for arrays with object elements", () => {
    expect(isFlatScalarArray(["a", { x: 1 }, "c", "d"])).toBe(false);
  });

  it("returns false for arrays with nested arrays", () => {
    expect(isFlatScalarArray(["a", ["b"], "c", "d"])).toBe(false);
  });

  it("returns false for non-array values", () => {
    expect(isFlatScalarArray("hello")).toBe(false);
    expect(isFlatScalarArray(42)).toBe(false);
    expect(isFlatScalarArray(null)).toBe(false);
    expect(isFlatScalarArray({ a: 1 })).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(isFlatScalarArray([])).toBe(false);
  });
});

describe("buildAttributeChanges - collection-aware rendering", () => {
  it("renders a large set (sorted array of strings) as a single large attribute", () => {
    const perms = [
      "compute.instances.get",
      "compute.instances.list",
      "compute.networks.get",
      "iam.roles.list",
      "storage.buckets.get",
    ];
    const newPerms = [
      "compute.instances.get",
      "compute.instances.list",
      "compute.instances.setMetadata",
      "compute.networks.get",
      "iam.roles.list",
    ];
    const result = buildAttributeChanges(
      makeChange({
        before: { permissions: perms },
        after: { permissions: newPerms },
      }),
      {},
    );
    const attr = result.find((a) => a.name === "permissions");
    expect(attr).toBeDefined();
    expect(attr!.isLarge).toBe(true);
    expect(attr!.before).toBe(perms.join("\n"));
    expect(attr!.after).toBe(newPerms.join("\n"));
    expect(attr!.isSensitive).toBe(false);
    expect(attr!.isKnownAfterApply).toBe(false);
    // No individual permissions[N] entries should exist
    const indexed = result.filter((a) => a.name.startsWith("permissions["));
    expect(indexed).toHaveLength(0);
  });

  it("preserves original order for unsorted lists", () => {
    const before = [
      "deny 10.0.0.0/8",
      "allow 192.168.0.0/16",
      "deny 172.16.0.0/12",
      "allow all",
    ];
    const after = [
      "allow 192.168.0.0/16",
      "deny 10.0.0.0/8",
      "deny 172.16.0.0/12",
      "allow all",
    ];
    const result = buildAttributeChanges(
      makeChange({ before: { rules: before }, after: { rules: after } }),
      {},
    );
    const attr = result.find((a) => a.name === "rules");
    expect(attr).toBeDefined();
    expect(attr!.isLarge).toBe(true);
    expect(attr!.before).toBe(before.join("\n"));
    expect(attr!.after).toBe(after.join("\n"));
  });

  it("does not use collection rendering for small arrays (< 4 elements)", () => {
    const result = buildAttributeChanges(
      makeChange({
        before: { tags: ["a", "b", "c"] },
        after: { tags: ["a", "b", "d"] },
      }),
      {},
    );
    // Small array should be flattened into individual entries
    const indexed = result.filter((a) => a.name.startsWith("tags["));
    expect(indexed.length).toBeGreaterThan(0);
    const collection = result.find((a) => a.name === "tags");
    expect(collection).toBeUndefined();
  });

  it("falls back to flattened rendering for per-element sensitivity", () => {
    const perms = ["a", "b", "c", "d", "e"];
    const result = buildAttributeChanges(
      makeChange({
        before: { items: perms },
        after: { items: [...perms, "f"] },
        before_sensitive: { items: [false, true, false, false, false] },
      }),
      {},
    );
    // Per-element sensitivity forces fallback to flattened
    const collection = result.find((a) => a.name === "items");
    expect(collection).toBeUndefined();
    const indexed = result.filter((a) => a.name.startsWith("items["));
    expect(indexed.length).toBeGreaterThan(0);
  });

  it("handles whole-attribute sensitivity for collections", () => {
    const perms = ["perm1", "perm2", "perm3", "perm4"];
    const result = buildAttributeChanges(
      makeChange({
        before: { secrets: perms },
        after: { secrets: [...perms, "perm5"] },
        before_sensitive: { secrets: true },
        after_sensitive: { secrets: true },
      }),
      {},
    );
    const attr = result.find((a) => a.name === "secrets");
    expect(attr).toBeDefined();
    expect(attr!.isSensitive).toBe(true);
    expect(attr!.before).toBe("(sensitive)");
    expect(attr!.after).toBe("(sensitive)");
  });

  it("handles collection where before is null (resource creation)", () => {
    const perms = ["perm1", "perm2", "perm3", "perm4"];
    const result = buildAttributeChanges(
      makeChange({
        before: null,
        after: { permissions: perms },
      }),
      {},
    );
    const attr = result.find((a) => a.name === "permissions");
    expect(attr).toBeDefined();
    expect(attr!.isLarge).toBe(true);
    expect(attr!.before).toBe(null);
    expect(attr!.after).toBe(perms.join("\n"));
  });

  it("handles collection where after is null (resource deletion)", () => {
    const perms = ["perm1", "perm2", "perm3", "perm4"];
    const result = buildAttributeChanges(
      makeChange({
        before: { permissions: perms },
        after: null,
      }),
      {},
    );
    const attr = result.find((a) => a.name === "permissions");
    expect(attr).toBeDefined();
    expect(attr!.isLarge).toBe(true);
    expect(attr!.before).toBe(perms.join("\n"));
    expect(attr!.after).toBe(null);
  });

  it("handles collection where after_unknown is true for the attribute", () => {
    const perms = ["perm1", "perm2", "perm3", "perm4"];
    const result = buildAttributeChanges(
      makeChange({
        before: { permissions: perms },
        after: null,
        after_unknown: { permissions: true },
      }),
      {},
    );
    const attr = result.find((a) => a.name === "permissions");
    expect(attr).toBeDefined();
    expect(attr!.isKnownAfterApply).toBe(true);
    expect(attr!.after).toBe("(known after apply)");
  });

  it("skips unchanged collection when showUnchangedAttributes is false", () => {
    const perms = ["perm1", "perm2", "perm3", "perm4"];
    const result = buildAttributeChanges(
      makeChange({
        before: { permissions: perms },
        after: { permissions: perms },
      }),
      {},
    );
    const attr = result.find((a) => a.name === "permissions");
    expect(attr).toBeUndefined();
    // Also no individual entries
    const indexed = result.filter((a) => a.name.startsWith("permissions["));
    expect(indexed).toHaveLength(0);
  });

  it("includes unchanged collection when showUnchangedAttributes is true", () => {
    const perms = ["perm1", "perm2", "perm3", "perm4"];
    const result = buildAttributeChanges(
      makeChange({
        before: { permissions: perms },
        after: { permissions: perms },
      }),
      { showUnchangedAttributes: true },
    );
    const attr = result.find((a) => a.name === "permissions");
    expect(attr).toBeDefined();
    expect(attr!.before).toBe(attr!.after);
    expect(attr!.isLarge).toBe(true);
  });

  it("does not interfere with non-collection attributes on the same resource", () => {
    const perms = ["perm1", "perm2", "perm3", "perm4"];
    const result = buildAttributeChanges(
      makeChange({
        before: { name: "old-role", permissions: perms },
        after: { name: "new-role", permissions: [...perms, "perm5"] },
      }),
      {},
    );
    const nameAttr = result.find((a) => a.name === "name");
    expect(nameAttr).toBeDefined();
    expect(nameAttr!.before).toBe("old-role");
    expect(nameAttr!.after).toBe("new-role");
    expect(nameAttr!.isLarge).toBe(false);

    const permAttr = result.find((a) => a.name === "permissions");
    expect(permAttr).toBeDefined();
    expect(permAttr!.isLarge).toBe(true);
  });

  it("falls back to flattened for per-element after_unknown", () => {
    const perms = ["perm1", "perm2", "perm3", "perm4"];
    const result = buildAttributeChanges(
      makeChange({
        before: { items: perms },
        after: null,
        after_unknown: { items: [true, false, true, false] },
      }),
      {},
    );
    // Per-element unknown forces fallback
    const collection = result.find((a) => a.name === "items");
    expect(collection).toBeUndefined();
    const indexed = result.filter((a) => a.name.startsWith("items["));
    expect(indexed.length).toBeGreaterThan(0);
  });

  it("renders numbers as strings in collection output", () => {
    const result = buildAttributeChanges(
      makeChange({
        before: { ports: [80, 443, 8080, 8443] },
        after: { ports: [80, 443, 8080, 9090] },
      }),
      {},
    );
    const attr = result.find((a) => a.name === "ports");
    expect(attr).toBeDefined();
    expect(attr!.before).toBe("80\n443\n8080\n8443");
    expect(attr!.after).toBe("80\n443\n8080\n9090");
  });
});
