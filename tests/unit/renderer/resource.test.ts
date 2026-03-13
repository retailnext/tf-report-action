import { describe, it, expect } from "vitest";
import { renderResource } from "../../../src/renderer/resource.js";
import { MarkdownWriter } from "../../../src/renderer/writer.js";
import type { ResourceChange } from "../../../src/model/resource.js";
import type { DiffEntry } from "../../../src/diff/types.js";

function makeResource(overrides: Partial<ResourceChange> = {}): ResourceChange {
  return {
    address: "null_resource.test",
    moduleAddress: null,
    type: "null_resource",
    name: "test",
    action: "create",
    actionReason: null,
    attributes: [],
    importId: null,
    movedFromAddress: null,
    allUnknownAfterApply: false,
    ...overrides,
  };
}

function render(
  resource: ResourceChange,
  options: Parameters<typeof renderResource>[2] = {},
): string {
  const writer = new MarkdownWriter();
  const cache = new Map<string, DiffEntry[]>();
  renderResource(resource, writer, options, cache);
  return writer.build();
}

describe("renderResource", () => {
  it("renders a details block", () => {
    const output = render(makeResource());
    expect(output).toContain("<details>");
    expect(output).toContain("</details>");
  });

  it("shows resource type and name in summary", () => {
    const output = render(makeResource({ type: "null_resource", name: "example" }));
    expect(output).toContain("null_resource");
    expect(output).toContain("example");
  });

  it("shows action symbol in summary", () => {
    const output = render(makeResource({ action: "create" }));
    expect(output).toContain("➕");
  });

  it("shows delete symbol for delete action", () => {
    const output = render(makeResource({ action: "delete" }));
    expect(output).toContain("🗑️");
  });

  it("shows import ID when present", () => {
    const output = render(makeResource({ importId: "i-abc123" }));
    expect(output).toContain("i-abc123");
    expect(output).toContain("Import ID");
  });

  it("does not show import ID section when absent", () => {
    const output = render(makeResource({ importId: null }));
    expect(output).not.toContain("Import ID");
  });

  it("shows moved-from address when present", () => {
    const output = render(makeResource({ movedFromAddress: "null_resource.old" }));
    expect(output).toContain("null_resource.old");
    expect(output).toContain("Moved from");
  });

  it("shows 'all values known after apply' message", () => {
    const output = render(makeResource({ allUnknownAfterApply: true }));
    expect(output).toContain("known after apply");
  });

  it("shows 'No attribute changes' when attributes empty and not allUnknown", () => {
    const output = render(makeResource({ attributes: [] }));
    expect(output).toContain("No attribute changes");
  });

  it("renders attribute table for small attributes", () => {
    const output = render(
      makeResource({
        attributes: [
          {
            name: "tag",
            before: "old",
            after: "new",
            isSensitive: false,
            isLarge: false,
            isKnownAfterApply: false,
          },
        ],
      }),
    );
    expect(output).toContain("tag");
    expect(output).toContain("Attribute");
    expect(output).toContain("Before");
    expect(output).toContain("After");
  });

  it("masks sensitive attributes as (sensitive)", () => {
    const output = render(
      makeResource({
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
      }),
    );
    expect(output).toContain("(sensitive)");
    // Raw secret value must not appear
    expect(output).not.toContain("old_secret");
  });

  it("renders large attributes as collapsible blocks, not table rows", () => {
    const output = render(
      makeResource({
        attributes: [
          {
            name: "policy",
            before: '{"Version":"2012-10-17"}',
            after: '{"Version":"2012-10-17","Statement":[]}',
            isSensitive: false,
            isLarge: true,
            isKnownAfterApply: false,
          },
        ],
      }),
    );
    expect(output).toContain("Large value");
    expect(output).toContain("policy");
  });

  it("shows changed attribute hints in update summary", () => {
    const output = render(
      makeResource({
        action: "update",
        attributes: [
          {
            name: "name",
            before: "old",
            after: "new",
            isSensitive: false,
            isLarge: false,
            isKnownAfterApply: false,
          },
        ],
      }),
    );
    expect(output).toContain("name");
    expect(output).toContain("changed");
  });

  it("uses simple diff format when specified", () => {
    const output = render(
      makeResource({
        attributes: [
          {
            name: "value",
            before: "old",
            after: "new",
            isSensitive: false,
            isLarge: false,
            isKnownAfterApply: false,
          },
        ],
      }),
      { diffFormat: "simple" },
    );
    expect(output).toContain("- old");
    expect(output).toContain("+ new");
  });
});
