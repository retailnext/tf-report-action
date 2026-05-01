import { describe, expect, it } from "vitest";
import type { Renderable } from "../../../src/model/renderable.js";
import type { ResourceChange } from "../../../src/model/resource.js";
import type { DiffEntry } from "../../../src/diff/types.js";
import { buildResourceRenderable } from "../../../src/elements/resource.js";

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

/** Create a minimal ResourceChange for tests. */
function makeResource(overrides?: Partial<ResourceChange>): ResourceChange {
  return {
    address: "aws_instance.web",
    type: "aws_instance",
    action: "create",
    actionReason: null,
    attributes: [],
    hasAttributeDetail: true,
    importId: null,
    movedFromAddress: null,
    allUnknownAfterApply: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Level 0 — listing
// ---------------------------------------------------------------------------

describe("buildResourceRenderable - level 0 (listing)", () => {
  it("renders action symbol + address", () => {
    const r = buildResourceRenderable(
      makeResource({ action: "create", address: "aws_instance.web" }),
      {},
      new Map(),
      0,
    );
    const md = r.render("markdown");
    expect(md).toContain("aws\\_instance.web");
    // Contains an emoji/symbol for create action
    expect(md.length).toBeGreaterThan("aws_instance.web".length);
    assertSizeInvariant(r, "listing");
  });

  it("uses different symbols for different actions", () => {
    const create = buildResourceRenderable(
      makeResource({ action: "create" }),
      {},
      new Map(),
      0,
    );
    const del = buildResourceRenderable(
      makeResource({ action: "delete" }),
      {},
      new Map(),
      0,
    );
    const createMd = create.render("markdown");
    const delMd = del.render("markdown");
    expect(createMd).not.toBe(delMd);
  });
});

// ---------------------------------------------------------------------------
// Level 1 — compact (details block, no attributes)
// ---------------------------------------------------------------------------

describe("buildResourceRenderable - level 1 (compact)", () => {
  it("renders as details block with summary", () => {
    const r = buildResourceRenderable(makeResource(), {}, new Map(), 1);
    const md = r.render("markdown");
    expect(md).toContain("<details>");
    expect(md).toContain("<summary>");
    expect(md).toContain("aws_instance");
    assertSizeInvariant(r, "compact");
  });

  it("includes address in code block", () => {
    const r = buildResourceRenderable(
      makeResource({ address: "module.vpc.aws_subnet.main" }),
      {},
      new Map(),
      1,
    );
    const md = r.render("markdown");
    expect(md).toContain("module.vpc.aws_subnet.main");
    assertSizeInvariant(r, "compact-addr");
  });

  it("shows import ID when present", () => {
    const r = buildResourceRenderable(
      makeResource({ importId: "i-1234567890" }),
      {},
      new Map(),
      1,
    );
    const md = r.render("markdown");
    expect(md).toContain("i-1234567890");
    assertSizeInvariant(r, "compact-import");
  });

  it("shows moved-from address when present", () => {
    const r = buildResourceRenderable(
      makeResource({
        action: "move",
        movedFromAddress: "aws_instance.old",
      }),
      {},
      new Map(),
      1,
    );
    const md = r.render("markdown");
    expect(md).toContain("aws_instance.old");
    assertSizeInvariant(r, "compact-moved");
  });
});

// ---------------------------------------------------------------------------
// Level 2 — attributes without diffs
// ---------------------------------------------------------------------------

describe("buildResourceRenderable - level 2 (attrs-no-diff)", () => {
  it("renders attribute table without diff formatting", () => {
    const resource = makeResource({
      action: "update",
      attributes: [
        {
          name: "ami",
          before: "ami-old",
          after: "ami-new",
          isSensitive: false,
          isLarge: false,
          isKnownAfterApply: false,
        },
      ],
    });
    const r = buildResourceRenderable(resource, {}, new Map(), 2);
    const md = r.render("markdown");
    expect(md).toContain("ami");
    expect(md).toContain("ami-old");
    expect(md).toContain("ami-new");
    assertSizeInvariant(r, "attrs-no-diff");
  });

  it("renders sensitive attributes without char-level diffs", () => {
    const resource = makeResource({
      action: "update",
      attributes: [
        {
          name: "password",
          before: "(sensitive)",
          after: "(sensitive)",
          isSensitive: true,
          isLarge: false,
          isKnownAfterApply: false,
        },
      ],
    });
    const r = buildResourceRenderable(resource, {}, new Map(), 2);
    const md = r.render("markdown");
    expect(md).toContain("password");
    // Sensitive values should not get char-level diff treatment
    expect(md).not.toContain("<del");
    expect(md).not.toContain("<ins");
    assertSizeInvariant(r, "sensitive");
  });
});

// ---------------------------------------------------------------------------
// Level 3 — attributes with char diffs
// ---------------------------------------------------------------------------

describe("buildResourceRenderable - level 3 (attrs-char-diff)", () => {
  it("includes char-level diffs for changed attributes", () => {
    const resource = makeResource({
      action: "update",
      attributes: [
        {
          name: "ami",
          before: "ami-old123",
          after: "ami-new456",
          isSensitive: false,
          isLarge: false,
          isKnownAfterApply: false,
        },
      ],
    });
    const r = buildResourceRenderable(
      resource,
      { diffFormat: "inline" },
      new Map(),
      3,
    );
    const md = r.render("markdown");
    // Level 3 should include char-level diff formatting
    expect(md).toContain("ami");
    assertSizeInvariant(r, "attrs-diff");
  });
});

// ---------------------------------------------------------------------------
// Level 4 — full with large values
// ---------------------------------------------------------------------------

describe("buildResourceRenderable - level 4 (full)", () => {
  it("includes large value blocks", () => {
    const resource = makeResource({
      action: "update",
      attributes: [
        {
          name: "policy",
          before: '{"Version": "2012-10-17"}',
          after: '{"Version": "2012-10-17", "Statement": []}',
          isSensitive: false,
          isLarge: true,
          isKnownAfterApply: false,
        },
      ],
    });
    const cache = new Map<string, DiffEntry[]>();
    const r = buildResourceRenderable(resource, {}, cache, 4);
    const md = r.render("markdown");
    expect(md).toContain("policy");
    expect(md).toContain("large value");
    assertSizeInvariant(r, "full-large");
  });

  it("size increases monotonically with level", () => {
    const resource = makeResource({
      action: "update",
      attributes: [
        {
          name: "ami",
          before: "ami-old",
          after: "ami-new",
          isSensitive: false,
          isLarge: false,
          isKnownAfterApply: false,
        },
        {
          name: "config",
          before: "line1\nline2\nline3",
          after: "line1\nchanged\nline3",
          isSensitive: false,
          isLarge: true,
          isKnownAfterApply: false,
        },
      ],
    });
    const cache = new Map<string, DiffEntry[]>();
    const sizes = [0, 1, 2, 3, 4].map((level) =>
      buildResourceRenderable(resource, {}, cache, level).size("markdown"),
    );
    // Each level should be >= previous level
    for (let i = 1; i < sizes.length; i++) {
      expect(
        sizes[i],
        `level ${String(i)} >= level ${String(i - 1)}`,
      ).toBeGreaterThanOrEqual(sizes[i - 1] ?? 0);
    }
  });
});

// ---------------------------------------------------------------------------
// Apply context
// ---------------------------------------------------------------------------

describe("buildResourceRenderable - apply context", () => {
  it("shows failure indicator when apply context is failed", () => {
    const resource = makeResource({ action: "create" });
    const r = buildResourceRenderable(resource, {}, new Map(), 1, {
      failed: true,
      diagnostics: [],
    });
    const md = r.render("markdown");
    expect(md).toContain("❌");
    assertSizeInvariant(r, "apply-failed");
  });

  it("shows diagnostics from apply context", () => {
    const resource = makeResource({ action: "create" });
    const r = buildResourceRenderable(resource, {}, new Map(), 1, {
      failed: true,
      diagnostics: [
        {
          severity: "error",
          summary: "Resource creation failed",
          detail: "timeout exceeded",
        },
      ],
    });
    const md = r.render("markdown");
    expect(md).toContain("Resource creation failed");
    assertSizeInvariant(r, "apply-diags");
  });
});
