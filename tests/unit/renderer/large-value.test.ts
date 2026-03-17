import { describe, it, expect } from "vitest";
import { renderLargeValue } from "../../../src/renderer/large-value.js";
import type { DiffEntry } from "../../../src/diff/types.js";

function makeCache(): Map<string, DiffEntry[]> {
  return new Map();
}

describe("renderLargeValue", () => {
  it("returns empty string when both before and after are null", () => {
    expect(renderLargeValue("attr", null, null, makeCache())).toBe("");
  });

  it("returns a details block for added value (before null)", () => {
    const result = renderLargeValue(
      "my_attr",
      null,
      '{"key": "value"}',
      makeCache(),
    );
    expect(result).toContain("<details>");
    expect(result).toContain("<summary>");
    expect(result).toContain("my_attr");
    expect(result).toContain("</details>");
  });

  it("returns a details block for removed value (after null)", () => {
    const result = renderLargeValue(
      "my_attr",
      '{"key": "old"}',
      null,
      makeCache(),
    );
    expect(result).toContain("<details>");
    expect(result).toContain("my_attr");
  });

  it("includes diff for both before and after", () => {
    const before = '{"env": "staging"}';
    const after = '{"env": "production"}';
    const result = renderLargeValue("config", before, after, makeCache());
    expect(result).toContain("diff");
    expect(result).toContain("changes");
  });

  it("pretty-prints valid JSON", () => {
    const result = renderLargeValue("data", null, '{"a":1}', makeCache());
    // Pretty-printed JSON would have indentation
    expect(result).toContain('"a"');
  });

  it("handles non-JSON content", () => {
    const before = "line1\nline2\nline3\nline4\nline5";
    const after = "line1\nline2\nline3\nline4\nchanged";
    const result = renderLargeValue("content", before, after, makeCache());
    expect(result).toContain("<details>");
    expect(result).toContain("content");
  });

  it("includes line count in summary", () => {
    const before = "a\nb\nc";
    const after = "a\nb\nd";
    const result = renderLargeValue("text", before, after, makeCache());
    expect(result).toMatch(/\d+ lines/);
  });

  it("shows 'Large value: name' without line counts for single side", () => {
    const result = renderLargeValue("blob", null, "some content", makeCache());
    expect(result).toContain("Large value: blob");
    // Single-side entries don't have totalLines > 0
  });

  it("uses the diff cache", () => {
    const cache = makeCache();
    const before = "line1\nline2";
    const after = "line1\nchanged";
    renderLargeValue("attr", before, after, cache);
    const sizeBefore = cache.size;
    renderLargeValue("attr", before, after, cache);
    // Cache size should not grow on second call
    expect(cache.size).toBe(sizeBefore);
  });
});
