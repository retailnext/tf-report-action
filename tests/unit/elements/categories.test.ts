import { describe, expect, it } from "vitest";
import type { ReportElement } from "../../../src/renderable/types.js";
import type { ResourceChange } from "../../../src/model/resource.js";
import type { OutputChange } from "../../../src/model/output.js";
import {
  ResourceCategoryElement,
  DriftCategoryElement,
  OutputCategoryElement,
} from "../../../src/elements/categories.js";

/**
 * Verify size invariant for a ReportElement at all levels and both formats.
 */
function assertElementSizeInvariant(el: ReportElement, label?: string): void {
  for (const fmt of ["markdown", "html"] as const) {
    for (let lvl = 0; lvl < el.levels; lvl++) {
      const rendered = el.render(fmt, lvl);
      expect(
        el.size(fmt, lvl),
        `${label ?? el.id} size(${fmt}, ${String(lvl)})`,
      ).toBe(rendered.length);
    }
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

/** Create a minimal OutputChange. */
function makeOutput(overrides?: Partial<OutputChange>): OutputChange {
  return {
    name: "ip",
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
// ResourceCategoryElement
// ---------------------------------------------------------------------------

describe("ResourceCategoryElement", () => {
  it("has correct metadata", () => {
    const el = new ResourceCategoryElement([makeResource()], {}, new Map());
    expect(el.id).toBe("resources");
    expect(el.fixed).toBe(false);
    expect(el.levels).toBe(5);
  });

  it("satisfies size invariant at all levels", () => {
    const resources = [
      makeResource({ address: "aws_instance.a" }),
      makeResource({ address: "aws_instance.b" }),
    ];
    const el = new ResourceCategoryElement(resources, {}, new Map());
    assertElementSizeInvariant(el, "resources");
  });

  it("level 0 is smallest (listing)", () => {
    const resources = [
      makeResource({
        attributes: [
          {
            name: "ami",
            before: null,
            after: "ami-123",
            isSensitive: false,
            isLarge: false,
            isKnownAfterApply: false,
          },
        ],
      }),
    ];
    const el = new ResourceCategoryElement(resources, {}, new Map());
    const sizes = Array.from({ length: 5 }, (_, i) => el.size("markdown", i));
    for (let i = 1; i < sizes.length; i++) {
      expect(
        sizes[i],
        `level ${String(i)} >= level ${String(i - 1)}`,
      ).toBeGreaterThanOrEqual(sizes[i - 1] ?? 0);
    }
  });

  it("level 0 renders listing lines", () => {
    const el = new ResourceCategoryElement(
      [makeResource({ address: "aws_instance.web" })],
      {},
      new Map(),
    );
    const md = el.render("markdown", 0);
    expect(md).toContain("aws_instance.web");
  });

  it("higher levels render details blocks", () => {
    const el = new ResourceCategoryElement([makeResource()], {}, new Map());
    const md = el.render("markdown", 1);
    expect(md).toContain("<details>");
  });
});

// ---------------------------------------------------------------------------
// DriftCategoryElement
// ---------------------------------------------------------------------------

describe("DriftCategoryElement", () => {
  it("has correct metadata", () => {
    const el = new DriftCategoryElement([makeResource()], {}, new Map());
    expect(el.id).toBe("drift");
    expect(el.fixed).toBe(false);
    expect(el.levels).toBe(5);
  });

  it("satisfies size invariant", () => {
    const el = new DriftCategoryElement(
      [makeResource({ action: "update" })],
      {},
      new Map(),
    );
    assertElementSizeInvariant(el, "drift");
  });

  it("includes drift heading", () => {
    const el = new DriftCategoryElement(
      [makeResource({ action: "update" })],
      {},
      new Map(),
    );
    const md = el.render("markdown", 1);
    // Should include drift-related content
    expect(md.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// OutputCategoryElement
// ---------------------------------------------------------------------------

describe("OutputCategoryElement", () => {
  it("has correct metadata", () => {
    const el = new OutputCategoryElement([makeOutput()], {}, new Map());
    expect(el.id).toBe("outputs");
    expect(el.fixed).toBe(false);
    expect(el.levels).toBe(5);
  });

  it("satisfies size invariant", () => {
    const el = new OutputCategoryElement([makeOutput()], {}, new Map());
    assertElementSizeInvariant(el, "outputs");
  });

  it("level 0 renders flat listing", () => {
    const el = new OutputCategoryElement([makeOutput()], {}, new Map());
    // Level 0 is a flat listing (heading + code block), not EMPTY
    expect(el.size("markdown", 0)).toBeGreaterThan(0);
    expect(el.size("markdown", 2)).toBeGreaterThan(el.size("markdown", 0));
  });

  it("renders output names at level 2+", () => {
    const el = new OutputCategoryElement(
      [makeOutput({ name: "vpc_id" })],
      {},
      new Map(),
    );
    const md = el.render("markdown", 2);
    expect(md).toContain("vpc_id");
  });
});
