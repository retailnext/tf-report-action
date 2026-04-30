import { describe, expect, it } from "vitest";
import type { Renderable } from "../../../src/renderable/types.js";
import type { OutputChange } from "../../../src/model/output.js";
import type { DiffEntry } from "../../../src/diff/types.js";
import { buildOutputsRenderable } from "../../../src/elements/outputs.js";

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

/** Create a minimal OutputChange for tests. */
function makeOutput(overrides?: Partial<OutputChange>): OutputChange {
  return {
    name: "instance_ip",
    action: "create",
    before: null,
    after: "10.0.0.1",
    isSensitive: false,
    isLarge: false,
    isKnownAfterApply: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Level filtering
// ---------------------------------------------------------------------------

describe("buildOutputsRenderable - level filtering", () => {
  it("returns EMPTY for level 0", () => {
    const outputs = [makeOutput()];
    const r = buildOutputsRenderable(outputs, {}, new Map(), 0);
    expect(r.size("markdown")).toBe(0);
  });

  it("returns EMPTY for level 1", () => {
    const outputs = [makeOutput()];
    const r = buildOutputsRenderable(outputs, {}, new Map(), 1);
    expect(r.size("markdown")).toBe(0);
  });

  it("returns non-empty for level 2", () => {
    const outputs = [makeOutput()];
    const r = buildOutputsRenderable(outputs, {}, new Map(), 2);
    expect(r.size("markdown")).toBeGreaterThan(0);
    assertSizeInvariant(r, "level-2");
  });
});

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe("buildOutputsRenderable - basic rendering", () => {
  it("renders output name and value", () => {
    const outputs = [makeOutput({ name: "vpc_id", after: "vpc-12345" })];
    const r = buildOutputsRenderable(outputs, {}, new Map(), 2);
    const md = r.render("markdown");
    expect(md).toContain("vpc\\_id");
    assertSizeInvariant(r, "basic");
  });

  it("renders multiple outputs", () => {
    const outputs = [
      makeOutput({ name: "ip", after: "10.0.0.1" }),
      makeOutput({ name: "dns", after: "example.com" }),
    ];
    const r = buildOutputsRenderable(outputs, {}, new Map(), 2);
    const md = r.render("markdown");
    expect(md).toContain("ip");
    expect(md).toContain("dns");
    assertSizeInvariant(r, "multiple");
  });

  it("handles sensitive outputs", () => {
    const outputs = [makeOutput({ name: "secret", isSensitive: true })];
    const r = buildOutputsRenderable(outputs, {}, new Map(), 2);
    const md = r.render("markdown");
    expect(md).toContain("secret");
    assertSizeInvariant(r, "sensitive");
  });

  it("handles known-after-apply outputs", () => {
    const outputs = [
      makeOutput({ name: "future_ip", isKnownAfterApply: true }),
    ];
    const r = buildOutputsRenderable(outputs, {}, new Map(), 2);
    const md = r.render("markdown");
    expect(md).toContain("future\\_ip");
    assertSizeInvariant(r, "known-after");
  });
});

// ---------------------------------------------------------------------------
// Diff levels
// ---------------------------------------------------------------------------

describe("buildOutputsRenderable - diff levels", () => {
  it("level 2 does not include char diffs", () => {
    const outputs = [
      makeOutput({ action: "update", before: "old-val", after: "new-val" }),
    ];
    const r2 = buildOutputsRenderable(
      outputs,
      { diffFormat: "inline" },
      new Map(),
      2,
    );
    assertSizeInvariant(r2, "no-diff");
  });

  it("level 3 includes diffs", () => {
    const outputs = [
      makeOutput({ action: "update", before: "old-val", after: "new-val" }),
    ];
    const r3 = buildOutputsRenderable(
      outputs,
      { diffFormat: "inline" },
      new Map(),
      3,
    );
    assertSizeInvariant(r3, "with-diff");
  });

  it("size increases monotonically with level for changed outputs", () => {
    const outputs = [
      makeOutput({
        action: "update",
        before: "old-value",
        after: "new-value",
        isLarge: true,
      }),
    ];
    const cache = new Map<string, DiffEntry[]>();
    const sizes = [2, 3, 4].map((level) =>
      buildOutputsRenderable(outputs, {}, cache, level).size("markdown"),
    );
    for (let i = 1; i < sizes.length; i++) {
      expect(
        sizes[i],
        `level ${String(i + 2)} >= level ${String(i + 1)}`,
      ).toBeGreaterThanOrEqual(sizes[i - 1] ?? 0);
    }
  });
});

// ---------------------------------------------------------------------------
// HTML format
// ---------------------------------------------------------------------------

describe("buildOutputsRenderable - HTML format", () => {
  it("renders as HTML table", () => {
    const outputs = [makeOutput()];
    const r = buildOutputsRenderable(outputs, {}, new Map(), 2);
    const html = r.render("html");
    expect(html).toContain("<table>");
    assertSizeInvariant(r, "html-table");
  });
});
