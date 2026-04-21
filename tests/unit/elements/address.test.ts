import { describe, expect, it } from "vitest";
import {
  deriveModuleAddress,
  deriveInstanceName,
  groupByModule,
  moduleLabel,
} from "../../../src/elements/address.js";
import type { ResourceChange } from "../../../src/model/resource.js";

/** Helper to create a minimal ResourceChange for address tests. */
function rc(address: string, type: string): ResourceChange {
  return {
    address,
    type,
    action: "create",
    actionReason: null,
    attributes: [],
    hasAttributeDetail: false,
    importId: null,
    movedFromAddress: null,
    allUnknownAfterApply: false,
  };
}

// ---------------------------------------------------------------------------
// deriveModuleAddress
// ---------------------------------------------------------------------------

describe("deriveModuleAddress", () => {
  it("returns empty string for root-module resources", () => {
    expect(deriveModuleAddress("aws_instance.web", "aws_instance")).toBe("");
  });

  it("returns empty string for indexed root-module resource", () => {
    expect(deriveModuleAddress('aws_instance.web["a"]', "aws_instance")).toBe(
      "",
    );
  });

  it("returns module path for nested resource", () => {
    expect(
      deriveModuleAddress("module.vpc.aws_subnet.main", "aws_subnet"),
    ).toBe("module.vpc");
  });

  it("returns deeply nested module path", () => {
    expect(
      deriveModuleAddress(
        "module.env.module.db.aws_rds_cluster.main",
        "aws_rds_cluster",
      ),
    ).toBe("module.env.module.db");
  });

  it("uses last occurrence of type to handle type names that appear in module path", () => {
    expect(
      deriveModuleAddress(
        "module.aws_instance.aws_instance.main",
        "aws_instance",
      ),
    ).toBe("module.aws_instance");
  });

  it("returns empty string when type not found", () => {
    expect(deriveModuleAddress("unknown_thing.foo", "aws_instance")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// deriveInstanceName
// ---------------------------------------------------------------------------

describe("deriveInstanceName", () => {
  it("returns instance name for root-module resource", () => {
    expect(deriveInstanceName("aws_instance.web", "aws_instance")).toBe("web");
  });

  it("returns instance name with index for root resource", () => {
    expect(deriveInstanceName("aws_instance.web[0]", "aws_instance")).toBe(
      "web[0]",
    );
  });

  it("returns instance name for nested resource", () => {
    expect(deriveInstanceName("module.vpc.aws_subnet.main", "aws_subnet")).toBe(
      "main",
    );
  });

  it("returns full address when type not found", () => {
    expect(deriveInstanceName("unknown.foo", "aws_instance")).toBe(
      "unknown.foo",
    );
  });
});

// ---------------------------------------------------------------------------
// groupByModule
// ---------------------------------------------------------------------------

describe("groupByModule", () => {
  it("returns empty array for empty input", () => {
    expect(groupByModule([])).toEqual([]);
  });

  it("groups root-module resources under empty string", () => {
    const resources = [
      rc("aws_instance.a", "aws_instance"),
      rc("aws_instance.b", "aws_instance"),
    ];
    const groups = groupByModule(resources);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.moduleAddress).toBe("");
    expect(groups[0]?.resources).toHaveLength(2);
  });

  it("separates resources into module groups", () => {
    const resources = [
      rc("aws_instance.root", "aws_instance"),
      rc("module.vpc.aws_subnet.a", "aws_subnet"),
      rc("module.vpc.aws_subnet.b", "aws_subnet"),
      rc("module.db.aws_rds_cluster.main", "aws_rds_cluster"),
    ];
    const groups = groupByModule(resources);
    expect(groups).toHaveLength(3);
    // Root first
    expect(groups[0]?.moduleAddress).toBe("");
    expect(groups[0]?.resources).toHaveLength(1);
  });

  it("sorts root first, then alphabetically", () => {
    const resources = [
      rc("module.z.aws_instance.a", "aws_instance"),
      rc("aws_instance.root", "aws_instance"),
      rc("module.a.aws_subnet.a", "aws_subnet"),
    ];
    const groups = groupByModule(resources);
    expect(groups.map((g) => g.moduleAddress)).toEqual([
      "",
      "module.a",
      "module.z",
    ]);
  });
});

// ---------------------------------------------------------------------------
// moduleLabel
// ---------------------------------------------------------------------------

describe("moduleLabel", () => {
  it('returns "root" for empty module address', () => {
    expect(moduleLabel("")).toBe("root");
  });

  it("returns backtick-wrapped module address", () => {
    expect(moduleLabel("module.vpc")).toBe("`module.vpc`");
  });
});
