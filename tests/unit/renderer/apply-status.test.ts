import { describe, it, expect } from "vitest";
import { renderApplyStatuses } from "../../../src/renderer/apply-status.js";
import { MarkdownWriter } from "../../../src/renderer/writer.js";
import type { ApplyStatus } from "../../../src/model/apply-status.js";

function render(statuses: readonly ApplyStatus[]): string {
  const writer = new MarkdownWriter();
  renderApplyStatuses(statuses, writer);
  return writer.build();
}

describe("renderApplyStatuses", () => {
  it("renders a successful resource with elapsed time", () => {
    const md = render([
      {
        address: "null_resource.example",
        action: "create",
        success: true,
        elapsed: 3,
      },
    ]);
    expect(md).toContain("### Resource Outcomes");
    expect(md).toContain("✅");
    expect(md).toContain("`null_resource.example`");
    expect(md).toContain("➕"); // create symbol
    expect(md).toContain("3s");
  });

  it("renders a failed resource", () => {
    const md = render([
      {
        address: "null_resource.broken",
        action: "create",
        success: false,
        elapsed: 1,
      },
    ]);
    expect(md).toContain("❌");
    expect(md).toContain("`null_resource.broken`");
  });

  it("handles missing elapsed time", () => {
    const md = render([
      {
        address: "aws_instance.web",
        action: "update",
        success: true,
      },
    ]);
    // Should have an empty elapsed cell, not "undefineds"
    expect(md).not.toContain("undefined");
    expect(md).toContain("`aws_instance.web`");
  });

  it("renders multiple statuses in order", () => {
    const md = render([
      { address: "a.first", action: "create", success: true, elapsed: 1 },
      { address: "b.second", action: "delete", success: true, elapsed: 2 },
      { address: "c.third", action: "update", success: false, elapsed: 0 },
    ]);
    const firstIdx = md.indexOf("a.first");
    const secondIdx = md.indexOf("b.second");
    const thirdIdx = md.indexOf("c.third");
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it("renders table header columns", () => {
    const md = render([
      { address: "x.y", action: "create", success: true },
    ]);
    expect(md).toContain("| Status | Resource | Action | Elapsed |");
  });
});
