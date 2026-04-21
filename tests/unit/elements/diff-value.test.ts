import { describe, expect, it } from "vitest";
import type { Renderable } from "../../../src/renderable/types.js";
import type { DiffEntry } from "../../../src/diff/types.js";
import {
  buildInlineDiff,
  buildLargeValueDiff,
  buildLargeValueContextDiff,
} from "../../../src/elements/diff-value.js";

/**
 * Verify size invariant: size(format) === render(format).length for both formats.
 */
function assertSizeInvariant(node: Renderable, label?: string): void {
  for (const fmt of ["markdown", "html"] as const) {
    const rendered = node.render(fmt);
    expect(node.size(fmt), `${label ?? "node"} size(${fmt})`).toBe(
      rendered.length,
    );
  }
}

// ---------------------------------------------------------------------------
// buildInlineDiff
// ---------------------------------------------------------------------------

describe("buildInlineDiff", () => {
  it("returns EMPTY for both null values", () => {
    const r = buildInlineDiff(null, null, "inline");
    expect(r.size("markdown")).toBe(0);
    expect(r.size("html")).toBe(0);
  });

  it("returns EMPTY for both empty strings", () => {
    const r = buildInlineDiff("", "", "inline");
    expect(r.size("markdown")).toBe(0);
  });

  it("wraps identical values in code tags", () => {
    const r = buildInlineDiff("same", "same", "inline");
    const md = r.render("markdown");
    expect(md).toContain("<code>same</code>");
    assertSizeInvariant(r, "identical");
  });

  it("produces simple diff format with +/- prefixes", () => {
    const r = buildInlineDiff("old", "new", "simple");
    const md = r.render("markdown");
    expect(md).toContain("- old");
    expect(md).toContain("+ new");
    expect(md).toContain("<br>");
    assertSizeInvariant(r, "simple-diff");
  });

  it("produces inline char-diff format with del/ins tags", () => {
    const r = buildInlineDiff("hello", "hallo", "inline");
    const md = r.render("markdown");
    expect(md).toContain("<del");
    expect(md).toContain("<ins");
    assertSizeInvariant(r, "inline-diff");
  });

  it("handles null before (create)", () => {
    const r = buildInlineDiff(null, "new-value", "simple");
    const md = r.render("markdown");
    expect(md).toContain("+ new-value");
    assertSizeInvariant(r, "create");
  });

  it("handles null after (delete)", () => {
    const r = buildInlineDiff("old-value", null, "simple");
    const md = r.render("markdown");
    expect(md).toContain("- old-value");
    assertSizeInvariant(r, "delete");
  });

  it("escapes HTML entities in values", () => {
    const r = buildInlineDiff("<old>", "<new>", "simple");
    const md = r.render("markdown");
    expect(md).toContain("&lt;old&gt;");
    expect(md).toContain("&lt;new&gt;");
    assertSizeInvariant(r, "escape");
  });

  it("markdown and HTML produce identical output (HTML in both)", () => {
    const r = buildInlineDiff("a", "b", "inline");
    expect(r.render("markdown")).toBe(r.render("html"));
  });
});

// ---------------------------------------------------------------------------
// buildLargeValueDiff
// ---------------------------------------------------------------------------

describe("buildLargeValueDiff", () => {
  it("returns EMPTY for both null", () => {
    const cache = new Map<string, DiffEntry[]>();
    const r = buildLargeValueDiff("attr", null, null, cache);
    expect(r.size("markdown")).toBe(0);
  });

  it("renders single value in code block for create", () => {
    const cache = new Map<string, DiffEntry[]>();
    const r = buildLargeValueDiff("attr", null, "new\nvalue", cache);
    const md = r.render("markdown");
    expect(md).toContain("attr");
    expect(md).toContain("(large value)");
    assertSizeInvariant(r, "large-create");
  });

  it("renders single value in code block for delete", () => {
    const cache = new Map<string, DiffEntry[]>();
    const r = buildLargeValueDiff("attr", "old\nvalue", null, cache);
    const md = r.render("markdown");
    expect(md).toContain("attr");
    assertSizeInvariant(r, "large-delete");
  });

  it("renders line-level diff for changed values", () => {
    const cache = new Map<string, DiffEntry[]>();
    const r = buildLargeValueDiff(
      "config",
      "line1\nline2",
      "line1\nline3",
      cache,
    );
    const md = r.render("markdown");
    expect(md).toContain("diff");
    expect(md).toContain("-");
    expect(md).toContain("+");
    assertSizeInvariant(r, "large-diff");
  });

  it("shows added/removed line counts in summary", () => {
    const cache = new Map<string, DiffEntry[]>();
    const r = buildLargeValueDiff("cfg", "a\nb", "a\nc", cache);
    const md = r.render("markdown");
    expect(md).toMatch(/\+\d+.*-\d+/);
    assertSizeInvariant(r, "large-counts");
  });

  it("renders as Details block in HTML", () => {
    const cache = new Map<string, DiffEntry[]>();
    const r = buildLargeValueDiff("attr", null, "content", cache);
    const html = r.render("html");
    expect(html).toContain("<details>");
    expect(html).toContain("attr");
    assertSizeInvariant(r, "large-html");
  });

  it("JSON pretty-prints values", () => {
    const cache = new Map<string, DiffEntry[]>();
    const json = '{"key":"value"}';
    const r = buildLargeValueDiff("attr", null, json, cache);
    const md = r.render("markdown");
    // Pretty-printed should contain indented output
    expect(md).toContain('"key"');
    assertSizeInvariant(r, "large-json");
  });
});

// ---------------------------------------------------------------------------
// buildLargeValueContextDiff
// ---------------------------------------------------------------------------

describe("buildLargeValueContextDiff", () => {
  it("returns EMPTY for both null", () => {
    const cache = new Map<string, DiffEntry[]>();
    const r = buildLargeValueContextDiff("attr", null, null, cache);
    expect(r.size("markdown")).toBe(0);
  });

  it("renders single value for create", () => {
    const cache = new Map<string, DiffEntry[]>();
    const r = buildLargeValueContextDiff("attr", null, "content", cache);
    const md = r.render("markdown");
    expect(md).toContain("attr");
    assertSizeInvariant(r, "context-create");
  });

  it("returns EMPTY when values are identical", () => {
    const cache = new Map<string, DiffEntry[]>();
    const r = buildLargeValueContextDiff("attr", "same", "same", cache);
    expect(r.size("markdown")).toBe(0);
  });

  it("shows context around changes with ... gaps", () => {
    const cache = new Map<string, DiffEntry[]>();
    const before = Array.from(
      { length: 20 },
      (_, i) => `line${String(i)}`,
    ).join("\n");
    const afterLines = Array.from({ length: 20 }, (_, i) =>
      i === 10 ? "CHANGED" : `line${String(i)}`,
    );
    const after = afterLines.join("\n");
    const r = buildLargeValueContextDiff("cfg", before, after, cache);
    const md = r.render("markdown");
    expect(md).toContain("...");
    assertSizeInvariant(r, "context-gaps");
  });
});
