import { describe, it, expect } from "vitest";
import { buildAttributeChanges } from "../../../src/builder/attributes.js";
import type { Change } from "../../../src/tfjson/plan.js";
import type { ConfigRefIndex } from "../../../src/builder/config-refs.js";

const emptyConfigRefs: ConfigRefIndex = new Map();

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
      "null_resource.test",
      emptyConfigRefs,
      {},
    );
    expect(result).toEqual([]);
  });

  it("detects simple string change", () => {
    const result = buildAttributeChanges(
      makeChange({ before: { name: "old" }, after: { name: "new" } }),
      "null_resource.test",
      emptyConfigRefs,
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
      "null_resource.test",
      emptyConfigRefs,
      {},
    );
    expect(result).toHaveLength(0);
  });

  it("includes unchanged attributes when showUnchangedAttributes=true", () => {
    const result = buildAttributeChanges(
      makeChange({ before: { name: "same" }, after: { name: "same" } }),
      "null_resource.test",
      emptyConfigRefs,
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
      "null_resource.test",
      emptyConfigRefs,
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
      "null_resource.test",
      emptyConfigRefs,
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
      "null_resource.test",
      emptyConfigRefs,
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
      "null_resource.test",
      emptyConfigRefs,
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
      "null_resource.test",
      emptyConfigRefs,
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
      "null_resource.test",
      emptyConfigRefs,
      {},
    );
    const names = result.map((a) => a.name);
    expect(names).toEqual([...names].sort());
  });

  it("handles attribute added (before null, after present)", () => {
    const result = buildAttributeChanges(
      makeChange({ before: {}, after: { new_key: "value" } }),
      "null_resource.test",
      emptyConfigRefs,
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
      "null_resource.test",
      emptyConfigRefs,
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
      "null_resource.test",
      emptyConfigRefs,
      {},
    );
    const attr = result.find((a) => a.name === "tags.env");
    expect(attr).toBeDefined();
    expect(attr!.before).toBe("staging");
    expect(attr!.after).toBe("prod");
  });
});
