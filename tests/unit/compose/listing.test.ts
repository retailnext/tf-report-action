import { describe, it, expect } from "vitest";
import {
  renderResourceListing,
  renderOutputListing,
} from "../../../src/compose/listing.js";
import type { ResourceChange } from "../../../src/model/resource.js";
import type { OutputChange } from "../../../src/model/output.js";

function makeResource(address: string, action: string): ResourceChange {
  return {
    address,
    type: "null_resource",
    action: action as ResourceChange["action"],
    actionReason: null,
    attributes: [],
    hasAttributeDetail: false,
    importId: null,
    movedFromAddress: null,
    allUnknownAfterApply: false,
  };
}

function makeOutput(name: string, action: string): OutputChange {
  return {
    name,
    action: action as OutputChange["action"],
    before: null,
    after: "value",
    isSensitive: false,
    isLarge: false,
    isKnownAfterApply: false,
  };
}

describe("renderResourceListing", () => {
  it("renders a heading and fenced code block with emoji + address", () => {
    const resources = [
      makeResource("null_resource.a", "create"),
      makeResource("null_resource.b", "delete"),
    ];
    const result = renderResourceListing("Resource Changes", resources);
    expect(result).toContain("## Resource Changes");
    expect(result).toContain("```");
    expect(result).toContain("null_resource.a");
    expect(result).toContain("null_resource.b");
  });

  it("includes action symbol for each resource", () => {
    const resources = [makeResource("null_resource.x", "create")];
    const result = renderResourceListing("Changes", resources);
    // Should have the ➕ emoji for create
    expect(result).toContain("➕");
    expect(result).toContain("null_resource.x");
  });

  it("produces heading with empty code block for empty resources", () => {
    const result = renderResourceListing("Changes", []);
    expect(result).toContain("## Changes");
    expect(result).toContain("```");
  });
});

describe("renderOutputListing", () => {
  it("renders a heading and fenced code block with emoji + name", () => {
    const outputs = [
      makeOutput("vpc_id", "create"),
      makeOutput("subnet_id", "update"),
    ];
    const result = renderOutputListing("Output Changes", outputs);
    expect(result).toContain("## Output Changes");
    expect(result).toContain("```");
    expect(result).toContain("vpc_id");
    expect(result).toContain("subnet_id");
  });

  it("produces heading with empty code block for empty outputs", () => {
    const result = renderOutputListing("Outputs", []);
    expect(result).toContain("## Outputs");
  });
});
