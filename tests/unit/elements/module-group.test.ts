import { describe, expect, it } from "vitest";
import type { Renderable } from "../../../src/renderable/types.js";
import type { ResourceChange } from "../../../src/model/resource.js";
import type { DiffEntry } from "../../../src/diff/types.js";
import { buildModuleGroupRenderable } from "../../../src/elements/module-group.js";

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

/** Create a minimal ResourceChange. */
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
// Root module group
// ---------------------------------------------------------------------------

describe("buildModuleGroupRenderable - root module", () => {
  it("renders resources at level 1 (compact)", () => {
    const resources = [
      makeResource({ address: "aws_instance.a", type: "aws_instance" }),
      makeResource({ address: "aws_instance.b", type: "aws_instance" }),
    ];
    const r = buildModuleGroupRenderable("", resources, {}, new Map(), 1);
    const md = r.render("markdown");
    expect(md).toContain("aws_instance");
    assertSizeInvariant(r, "root-compact");
  });

  it("renders at higher levels with more detail", () => {
    const resources = [
      makeResource({
        address: "aws_instance.web",
        action: "update",
        attributes: [
          {
            name: "ami",
            before: "old",
            after: "new",
            isSensitive: false,
            isLarge: false,
            isKnownAfterApply: false,
          },
        ],
      }),
    ];
    const cache = new Map<string, DiffEntry[]>();
    const r2 = buildModuleGroupRenderable("", resources, {}, cache, 2);
    const r4 = buildModuleGroupRenderable("", resources, {}, cache, 4);
    expect(r4.size("markdown")).toBeGreaterThanOrEqual(r2.size("markdown"));
    assertSizeInvariant(r2, "root-l2");
    assertSizeInvariant(r4, "root-l4");
  });
});

// ---------------------------------------------------------------------------
// Named module group
// ---------------------------------------------------------------------------

describe("buildModuleGroupRenderable - named module", () => {
  it("includes module heading", () => {
    const resources = [
      makeResource({ address: "module.vpc.aws_subnet.a", type: "aws_subnet" }),
    ];
    const r = buildModuleGroupRenderable(
      "module.vpc",
      resources,
      {},
      new Map(),
      1,
    );
    const md = r.render("markdown");
    expect(md).toContain("module.vpc");
    assertSizeInvariant(r, "named-module");
  });
});

// ---------------------------------------------------------------------------
// Size invariant across formats and levels
// ---------------------------------------------------------------------------

describe("buildModuleGroupRenderable - size invariants", () => {
  it("satisfies size invariant for all levels", () => {
    const resources = [
      makeResource({
        action: "create",
        attributes: [
          {
            name: "name",
            before: null,
            after: "test",
            isSensitive: false,
            isLarge: false,
            isKnownAfterApply: false,
          },
        ],
      }),
    ];
    const cache = new Map<string, DiffEntry[]>();
    for (let level = 1; level <= 4; level++) {
      const r = buildModuleGroupRenderable("", resources, {}, cache, level);
      assertSizeInvariant(r, `level-${String(level)}`);
    }
  });
});
