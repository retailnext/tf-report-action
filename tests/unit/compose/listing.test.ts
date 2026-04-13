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

function makeOutput(
  name: string,
  action: string,
  sensitive = false,
): OutputChange {
  return {
    name,
    action: action as OutputChange["action"],
    before: null,
    after: "value",
    isSensitive: sensitive,
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

  it("truncates listing when maxLength is exceeded", () => {
    const resources = Array.from({ length: 50 }, (_, i) =>
      makeResource(
        `module.very_long_name.null_resource.item_${String(i)}`,
        "create",
      ),
    );
    // Use a tight budget that can only fit a few items
    const result = renderResourceListing("Resource Changes", resources, 300);
    expect(result.length).toBeLessThanOrEqual(300);
    expect(result).toContain("... and ");
    expect(result).toContain(" more");
  });

  it("shows all items when maxLength is generous", () => {
    const resources = [
      makeResource("null_resource.a", "create"),
      makeResource("null_resource.b", "delete"),
    ];
    const result = renderResourceListing("Resource Changes", resources, 10000);
    expect(result).toContain("null_resource.a");
    expect(result).toContain("null_resource.b");
    expect(result).not.toContain("more");
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

  it("marks sensitive outputs with (sensitive)", () => {
    const outputs = [
      makeOutput("public_key", "create", false),
      makeOutput("secret_key", "create", true),
    ];
    const result = renderOutputListing("Output Changes", outputs);
    expect(result).toContain("secret_key (sensitive)");
    expect(result).not.toContain("public_key (sensitive)");
  });

  it("truncates listing when maxLength is exceeded", () => {
    const outputs = Array.from({ length: 30 }, (_, i) =>
      makeOutput(`very_long_output_name_${String(i)}`, "create"),
    );
    const result = renderOutputListing("Output Changes", outputs, 250);
    expect(result.length).toBeLessThanOrEqual(250);
    expect(result).toContain("... and ");
  });
});
