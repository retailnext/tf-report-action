import { describe, it, expect } from "vitest";
import { buildLineDiff } from "../../../src/diff/line-diff.js";
import type { DiffEntry } from "../../../src/diff/types.js";

describe("buildLineDiff", () => {
  function diff(before: string, after: string): DiffEntry[] {
    return buildLineDiff(before, after, new Map());
  }

  it("returns empty array for identical strings", () => {
    const result = diff("same", "same");
    expect(result).toEqual([{ kind: "unchanged", value: "same" }]);
  });

  it("marks added line when before is empty", () => {
    const result = diff("", "new line");
    expect(result).toContainEqual({ kind: "added", value: "new line" });
  });

  it("marks removed line when after is empty", () => {
    const result = diff("old line", "");
    expect(result).toContainEqual({ kind: "removed", value: "old line" });
  });

  it("diffs multiline strings correctly", () => {
    const result = diff("a\nb\nc", "a\nd\nc");
    const kinds = result.map((e) => e.kind);
    expect(kinds).toContain("removed");
    expect(kinds).toContain("added");
    expect(kinds).toContain("unchanged");
  });

  it("shows unchanged lines around a change", () => {
    const result = diff("line1\nline2\nline3", "line1\nchanged\nline3");
    expect(result[0]).toEqual({ kind: "unchanged", value: "line1" });
    expect(result[result.length - 1]).toEqual({ kind: "unchanged", value: "line3" });
  });

  it("marks all lines as removed when after is empty string", () => {
    const result = diff("a\nb", "");
    // "a\nb" splits into ["a","b"]; "" splits into [""]
    // "" is "added" (the empty string line), a and b are "removed"
    const removedValues = result.filter((e) => e.kind === "removed").map((e) => e.value);
    expect(removedValues).toContain("a");
    expect(removedValues).toContain("b");
  });

  it("caches results for repeated calls", () => {
    const cache = new Map<string, DiffEntry[]>();
    const result1 = buildLineDiff("hello\nworld", "hello\nearth", cache);
    const result2 = buildLineDiff("hello\nworld", "hello\nearth", cache);
    expect(result1).toBe(result2); // Same reference from cache
  });

  it("uses different cache entries for different inputs", () => {
    const cache = new Map<string, DiffEntry[]>();
    buildLineDiff("a", "b", cache);
    buildLineDiff("c", "d", cache);
    expect(cache.size).toBe(2);
  });

  it("handles strings with only newlines", () => {
    const result = diff("\n\n", "\n");
    expect(result.length).toBeGreaterThan(0);
  });
});
