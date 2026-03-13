import { describe, it, expect } from "vitest";
import { renderSummary } from "../../../src/renderer/summary.js";
import { MarkdownWriter } from "../../../src/renderer/writer.js";
import type { Summary, SummaryActionGroup } from "../../../src/model/summary.js";

function render(summary: Summary, isApply = false): string {
  const writer = new MarkdownWriter();
  renderSummary(summary, writer, isApply);
  return writer.build();
}

function makeGroup(
  action: SummaryActionGroup["action"],
  types: Record<string, number>,
): SummaryActionGroup {
  const resourceTypes = Object.entries(types).map(([type, count]) => ({ type, count }));
  const total = resourceTypes.reduce((s, rt) => s + rt.count, 0);
  return { action, resourceTypes, total };
}

const empty: Summary = { actions: [], failures: [] };

describe("renderSummary — plan (present tense)", () => {
  it("renders 'No changes' for empty summary", () => {
    expect(render(empty)).toContain("No changes");
  });

  it("renders 3-column table header", () => {
    const summary: Summary = {
      actions: [makeGroup("create", { null_resource: 1 })],
      failures: [],
    };
    expect(render(summary)).toContain("| Action | Resource | Count |");
  });

  it("shows action symbol and present-tense label on first row only", () => {
    const summary: Summary = {
      actions: [makeGroup("create", { aws_instance: 2, aws_s3_bucket: 1 })],
      failures: [],
    };
    const md = render(summary);
    expect(md).toContain("| ➕ Add | aws_instance | 2 |");
    expect(md).toContain("|  | aws_s3_bucket | 1 |");
  });

  it("always renders bold subtotal row", () => {
    const summary: Summary = {
      actions: [makeGroup("create", { null_resource: 1 })],
      failures: [],
    };
    const md = render(summary);
    expect(md).toContain("|  | **Add** | **1** |");
  });

  it("renders multiple action groups in order", () => {
    const summary: Summary = {
      actions: [
        makeGroup("create", { aws_instance: 2 }),
        makeGroup("update", { aws_security_group: 1 }),
        makeGroup("delete", { aws_lambda_function: 1 }),
      ],
      failures: [],
    };
    const md = render(summary);
    expect(md).toContain("➕ Add");
    expect(md).toContain("🔧 Change");
    expect(md).toContain("🗑️ Destroy");
    expect(md).toContain("**Add**");
    expect(md).toContain("**Change**");
    expect(md).toContain("**Destroy**");
  });

  it("uses present-tense labels", () => {
    const summary: Summary = {
      actions: [
        makeGroup("create", { a: 1 }),
        makeGroup("update", { a: 1 }),
        makeGroup("replace", { a: 1 }),
        makeGroup("delete", { a: 1 }),
      ],
      failures: [],
    };
    const md = render(summary);
    expect(md).toContain("Add");
    expect(md).toContain("Change");
    expect(md).toContain("Replace");
    expect(md).toContain("Destroy");
  });
});

describe("renderSummary — apply (past tense)", () => {
  it("uses past-tense labels when isApply is true", () => {
    const summary: Summary = {
      actions: [
        makeGroup("create", { a: 1 }),
        makeGroup("update", { a: 1 }),
        makeGroup("replace", { a: 1 }),
        makeGroup("delete", { a: 1 }),
      ],
      failures: [],
    };
    const md = render(summary, true);
    expect(md).toContain("Added");
    expect(md).toContain("Changed");
    expect(md).toContain("Replaced");
    expect(md).toContain("Destroyed");
  });

  it("renders failure groups with ❌ and failure labels", () => {
    const summary: Summary = {
      actions: [makeGroup("create", { aws_instance: 1 })],
      failures: [
        makeGroup("create", { aws_instance: 1 }),
        makeGroup("update", { aws_iam_policy: 1 }),
      ],
    };
    const md = render(summary, true);
    expect(md).toContain("❌ Add failed");
    expect(md).toContain("❌ Change failed");
    expect(md).toContain("**Add failed**");
    expect(md).toContain("**Change failed**");
  });

  it("renders failure subtotals per action", () => {
    const summary: Summary = {
      actions: [],
      failures: [
        makeGroup("create", { aws_instance: 2, aws_s3_bucket: 1 }),
      ],
    };
    const md = render(summary, true);
    expect(md).toContain("|  | **Add failed** | **3** |");
  });
});
