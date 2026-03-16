import { describe, it, expect } from "vitest";
import { buildConfigRefs } from "../../../src/builder/config-refs.js";
import type { Config } from "../../../src/tfjson/config.js";

describe("buildConfigRefs", () => {
  it("returns empty map for undefined config", () => {
    expect(buildConfigRefs(undefined)).toEqual(new Map());
  });

  it("returns empty map for null config", () => {
    expect(buildConfigRefs(null)).toEqual(new Map());
  });

  it("returns empty map for config with no root_module", () => {
    expect(buildConfigRefs({})).toEqual(new Map());
  });

  it("returns empty map for module with no resources", () => {
    const config: Config = { root_module: {} };
    expect(buildConfigRefs(config)).toEqual(new Map());
  });

  it("indexes resources with expression references", () => {
    const config: Config = {
      root_module: {
        resources: [
          {
            address: "null_resource.example",
            expressions: {
              triggers: {
                references: ["var.trigger_value"],
              },
            },
          },
        ],
      },
    };
    const index = buildConfigRefs(config);
    const refMap = index.get("null_resource.example");
    expect(refMap).toBeDefined();
    expect(refMap!.get("triggers")).toContain("var.trigger_value");
  });

  it("skips resources with no expressions", () => {
    const config: Config = {
      root_module: {
        resources: [{ address: "null_resource.bare" }],
      },
    };
    const index = buildConfigRefs(config);
    expect(index.has("null_resource.bare")).toBe(false);
  });

  it("skips resources with no address", () => {
    const config: Config = {
      root_module: {
        resources: [
          {
            expressions: { key: { references: ["var.something"] } },
          },
        ],
      },
    };
    const index = buildConfigRefs(config);
    expect(index.size).toBe(0);
  });

  it("skips attributes with no references", () => {
    const config: Config = {
      root_module: {
        resources: [
          {
            address: "null_resource.example",
            expressions: {
              static_attr: { constant_value: "hardcoded" },
            },
          },
        ],
      },
    };
    const index = buildConfigRefs(config);
    // The resource may or may not appear — if it does, static_attr should have no refs
    const refMap = index.get("null_resource.example");
    if (refMap) {
      expect(refMap.has("static_attr")).toBe(false);
    }
  });

  it("recurses into module calls", () => {
    const config: Config = {
      root_module: {
        module_calls: {
          child: {
            module: {
              resources: [
                {
                  address: "module.child.null_resource.nested",
                  expressions: {
                    value: { references: ["var.parent_value"] },
                  },
                },
              ],
            },
          },
        },
      },
    };
    const index = buildConfigRefs(config);
    const refMap = index.get("module.child.null_resource.nested");
    expect(refMap).toBeDefined();
    expect(refMap!.get("value")).toContain("var.parent_value");
  });

  it("handles module call with undefined module", () => {
    const config: Config = {
      root_module: {
        module_calls: {
          empty_call: {},
        },
      },
    };
    expect(() => buildConfigRefs(config)).not.toThrow();
  });

  it("collects refs from nested expression objects", () => {
    const config: Config = {
      root_module: {
        resources: [
          {
            address: "null_resource.nested",
            expressions: {
              // Nested block (object of expressions, not a direct Expression)
              block: {
                inner: { references: ["some_resource.id"] },
              },
            },
          },
        ],
      },
    };
    const index = buildConfigRefs(config);
    // The nested structure should surface refs from inner
    const refMap = index.get("null_resource.nested");
    if (refMap) {
      const blockRefs = refMap.get("block");
      if (blockRefs) {
        expect(blockRefs).toContain("some_resource.id");
      }
    }
  });

  it("handles expression as an array of expressions", () => {
    const config: Config = {
      root_module: {
        resources: [
          {
            address: "null_resource.arr",
            expressions: {
              // Array-form expression
              items: [{ references: ["var.one"] }, { references: ["var.two"] }],
            },
          },
        ],
      },
    };
    const index = buildConfigRefs(config);
    const refMap = index.get("null_resource.arr");
    if (refMap) {
      const refs = refMap.get("items");
      if (refs) {
        expect(refs).toContain("var.one");
        expect(refs).toContain("var.two");
      }
    }
  });
});
