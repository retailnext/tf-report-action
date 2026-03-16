import { describe, it, expect } from "vitest";
import { renderResource } from "../../../src/renderer/resource.js";
import type { ApplyContext } from "../../../src/renderer/resource.js";
import { MarkdownWriter } from "../../../src/renderer/writer.js";
import type { ResourceChange } from "../../../src/model/resource.js";
import type { DiffEntry } from "../../../src/diff/types.js";

function makeResource(overrides: Partial<ResourceChange> = {}): ResourceChange {
  return {
    address: "null_resource.test",
    type: "null_resource",
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

function render(
  resource: ResourceChange,
  options: Parameters<typeof renderResource>[2] = {},
  applyContext?: ApplyContext,
): string {
  const writer = new MarkdownWriter();
  const cache = new Map<string, DiffEntry[]>();
  renderResource(resource, writer, options, cache, applyContext);
  return writer.build();
}

describe("renderResource", () => {
  it("renders a details block", () => {
    const output = render(makeResource());
    expect(output).toContain("<details>");
    expect(output).toContain("</details>");
  });

  it("shows resource type and name in summary", () => {
    const output = render(makeResource({ address: "null_resource.example", type: "null_resource" }));
    expect(output).toContain("null_resource");
    expect(output).toContain("example");
  });

  it("shows action symbol in summary", () => {
    const output = render(makeResource({ action: "create" }));
    expect(output).toContain("➕");
  });

  it("renders resource address in code fence after summary", () => {
    const output = render(makeResource({ address: "null_resource.test" }));
    expect(output).toContain("```\nnull_resource.test\n```");
  });

  it("renders full module address in code fence", () => {
    const output = render(makeResource({
      address: 'module.parent["2"].module.child.null_resource.item[1]',
      type: "null_resource",
    }));
    expect(output).toContain('```\nmodule.parent["2"].module.child.null_resource.item[1]\n```');
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
    const output = render(makeResource({ attributes: [], hasAttributeDetail: true }));
    expect(output).toContain("No attribute changes");
  });

  it("omits 'No attribute changes' when hasAttributeDetail is false", () => {
    const output = render(makeResource({ attributes: [], hasAttributeDetail: false }));
    expect(output).not.toContain("No attribute changes");
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

  it("does not char-diff (known after apply) placeholder", () => {
    const output = render(
      makeResource({
        action: "update",
        attributes: [
          {
            name: "id",
            before: "i-abc123",
            after: "(known after apply)",
            isSensitive: false,
            isLarge: false,
            isKnownAfterApply: true,
          },
        ],
      }),
    );
    // The placeholder should appear as inline code, not char-diffed
    expect(output).toContain("<code>(known after apply)</code>");
    // Must not contain <del>/<ins> diff markup
    expect(output).not.toMatch(/<del/);
    expect(output).not.toMatch(/<ins/);
  });

  it("char-diffs a literal string that happens to equal the placeholder text", () => {
    const output = render(
      makeResource({
        action: "update",
        attributes: [
          {
            name: "description",
            before: "old description",
            after: "(known after apply)",
            isSensitive: false,
            isLarge: false,
            isKnownAfterApply: false,
          },
        ],
      }),
    );
    // isKnownAfterApply is false, so the value IS char-diffed even though
    // it looks like the sentinel string
    expect(output).toMatch(/<del/);
    expect(output).toMatch(/<ins/);
  });
});

describe("renderResource — apply context", () => {
  it("renders <details open> and ❌ indicator when failed", () => {
    const output = render(makeResource(), {}, { failed: true, diagnostics: [] });
    expect(output).toContain("<details open>");
    expect(output).toContain("❌");
  });

  it("renders <details open> when resource has diagnostics (not failed)", () => {
    const output = render(makeResource(), {}, {
      failed: false,
      diagnostics: [{ severity: "warning", summary: "Deprecated", detail: "" }],
    });
    expect(output).toContain("<details open>");
    expect(output).not.toContain("❌");
  });

  it("renders <details> (closed) when no apply context", () => {
    const output = render(makeResource());
    expect(output).toContain("<details>");
    expect(output).not.toContain("<details open>");
  });

  it("renders inline error diagnostics after attributes", () => {
    const output = render(makeResource(), {}, {
      failed: true,
      diagnostics: [{
        severity: "error",
        summary: "Invalid AMI ID",
        detail: "The image id does not exist",
      }],
    });
    expect(output).toContain("🚨 **Invalid AMI ID**");
    expect(output).toContain("The image id does not exist");
  });

  it("renders inline warning diagnostics after attributes", () => {
    const output = render(makeResource(), {}, {
      failed: false,
      diagnostics: [{
        severity: "warning",
        summary: "Argument is deprecated",
        detail: "Use new_arg instead",
      }],
    });
    expect(output).toContain("⚠️ **Argument is deprecated**");
    expect(output).toContain("Use new_arg instead");
  });

  it("renders errors before warnings in inline diagnostics", () => {
    const output = render(makeResource(), {}, {
      failed: true,
      diagnostics: [
        { severity: "warning", summary: "warn1", detail: "" },
        { severity: "error", summary: "err1", detail: "" },
      ],
    });
    const errIdx = output.indexOf("err1");
    const warnIdx = output.indexOf("warn1");
    expect(errIdx).toBeLessThan(warnIdx);
  });

  it("does not render diagnostics section when apply context has empty diagnostics", () => {
    const output = render(makeResource(), {}, { failed: false, diagnostics: [] });
    expect(output).not.toContain("🚨");
    expect(output).not.toContain("⚠️");
  });
});
