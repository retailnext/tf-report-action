import { describe, it, expect } from "vitest";
import { flatten } from "../../src/flattener/index.js";

describe("flatten", () => {
  it("returns empty map for empty object", () => {
    expect(flatten({})).toEqual(new Map());
  });

  it("flattens a flat object", () => {
    const result = flatten({ a: "hello", b: 42, c: true, d: null });
    expect(result.get("a")).toBe("hello");
    expect(result.get("b")).toBe("42");
    expect(result.get("c")).toBe("true");
    expect(result.get("d")).toBe(null);
    expect(result.size).toBe(4);
  });

  it("flattens nested objects with dot notation", () => {
    const result = flatten({ outer: { inner: "value" } });
    expect(result.get("outer.inner")).toBe("value");
  });

  it("flattens deeply nested objects", () => {
    const result = flatten({ a: { b: { c: "deep" } } });
    expect(result.get("a.b.c")).toBe("deep");
  });

  it("flattens arrays with bracket notation", () => {
    const result = flatten(["x", "y", "z"]);
    expect(result.get("[0]")).toBe("x");
    expect(result.get("[1]")).toBe("y");
    expect(result.get("[2]")).toBe("z");
  });

  it("flattens arrays inside objects", () => {
    const result = flatten({ items: ["a", "b"] });
    expect(result.get("items[0]")).toBe("a");
    expect(result.get("items[1]")).toBe("b");
  });

  it("flattens objects inside arrays", () => {
    const result = flatten([{ key: "val" }]);
    expect(result.get("[0].key")).toBe("val");
  });

  it("flattens mixed nested structures", () => {
    const result = flatten({ a: [{ b: "x" }] });
    expect(result.get("a[0].b")).toBe("x");
  });

  it("stores null as null", () => {
    const result = flatten({ key: null });
    expect(result.get("key")).toBe(null);
    expect(result.has("key")).toBe(true);
  });

  it("stores boolean false as 'false'", () => {
    const result = flatten({ flag: false });
    expect(result.get("flag")).toBe("false");
  });

  it("handles scalar string root value", () => {
    const result = flatten("hello");
    expect(result.get("")).toBe("hello");
  });

  it("handles scalar number root value", () => {
    const result = flatten(42);
    expect(result.get("")).toBe("42");
  });

  it("handles scalar null root value", () => {
    const result = flatten(null);
    expect(result.get("")).toBe(null);
  });

  it("skips undefined values in objects", () => {
    // JSON objects never have undefined values, but we test defensiveness
    const obj = { a: "x", b: undefined as unknown as string };
    const result = flatten(obj);
    expect(result.has("b")).toBe(false);
  });

  it("flattens empty array", () => {
    const result = flatten([]);
    expect(result.size).toBe(0);
  });

  it("flattens empty nested array", () => {
    const result = flatten({ arr: [] });
    expect(result.size).toBe(0);
  });

  it("handles multiple levels with arrays and objects", () => {
    const result = flatten({
      tags: [
        { key: "env", value: "prod" },
        { key: "app", value: "web" },
      ],
    });
    expect(result.get("tags[0].key")).toBe("env");
    expect(result.get("tags[0].value")).toBe("prod");
    expect(result.get("tags[1].key")).toBe("app");
    expect(result.get("tags[1].value")).toBe("web");
  });
});
