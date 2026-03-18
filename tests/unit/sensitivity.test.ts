import { describe, it, expect } from "vitest";
import {
  getHierarchicalPaths,
  isSensitive,
} from "../../src/sensitivity/index.js";

describe("getHierarchicalPaths", () => {
  it("returns single element for a simple key", () => {
    expect(getHierarchicalPaths("name")).toEqual(["name"]);
  });

  it("returns dotted path and all ancestors", () => {
    expect(getHierarchicalPaths("a.b.c")).toEqual(["a.b.c", "a.b", "a"]);
  });

  it("strips trailing array index", () => {
    expect(getHierarchicalPaths("items[0]")).toEqual(["items[0]", "items"]);
  });

  it("handles nested array and object path", () => {
    expect(getHierarchicalPaths("variable[0].secret_value")).toEqual([
      "variable[0].secret_value",
      "variable[0]",
      "variable",
    ]);
  });

  it("handles multiple array indices", () => {
    const paths = getHierarchicalPaths("a[0][1]");
    expect(paths[0]).toBe("a[0][1]");
    expect(paths[1]).toBe("a[0]");
    expect(paths[2]).toBe("a");
  });

  it("returns empty array for empty string", () => {
    expect(getHierarchicalPaths("")).toEqual([]);
  });

  it("does not include duplicate paths", () => {
    const paths = getHierarchicalPaths("a.b");
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("isSensitive", () => {
  const empty = new Map<string, string | null>();

  it("returns false when both maps are empty", () => {
    expect(isSensitive("key", empty, empty)).toBe(false);
  });

  it("returns true when beforeSensitive has root true", () => {
    const before = new Map([["", "true"]]);
    expect(isSensitive("anything", before, empty)).toBe(true);
  });

  it("returns true when afterSensitive has root true", () => {
    const after = new Map([["", "true"]]);
    expect(isSensitive("anything", empty, after)).toBe(true);
  });

  it("returns false when root key is 'false'", () => {
    const before = new Map([["", "false"]]);
    expect(isSensitive("key", before, empty)).toBe(false);
  });

  it("returns true when direct key is marked sensitive in before", () => {
    const before = new Map([["password", "true"]]);
    expect(isSensitive("password", before, empty)).toBe(true);
  });

  it("returns true when direct key is marked sensitive in after", () => {
    const after = new Map([["token", "true"]]);
    expect(isSensitive("token", empty, after)).toBe(true);
  });

  it("returns true when ancestor is marked sensitive", () => {
    const before = new Map([["secrets", "true"]]);
    expect(isSensitive("secrets.api_key", before, empty)).toBe(true);
  });

  it("returns true when array parent is marked sensitive", () => {
    const after = new Map([["creds", "true"]]);
    expect(isSensitive("creds[0]", empty, after)).toBe(true);
  });

  it("returns false when a sibling key is sensitive but not this key", () => {
    const before = new Map([["other_password", "true"]]);
    expect(isSensitive("username", before, empty)).toBe(false);
  });

  it("returns false when sensitivity map has non-true values", () => {
    const before = new Map([
      ["key", "false"],
      ["key", null],
    ]);
    expect(isSensitive("key", before, empty)).toBe(false);
  });
});
