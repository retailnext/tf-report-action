import { describe, it, expect } from "vitest";
import { renderSummary } from "../../../src/renderer/summary.js";
import { MarkdownWriter } from "../../../src/renderer/writer.js";
import type { Summary } from "../../../src/model/summary.js";

function render(summary: Summary): string {
  const writer = new MarkdownWriter();
  renderSummary(summary, writer);
  return writer.build();
}

describe("renderSummary", () => {
  const emptySummary: Summary = { add: 0, change: 0, destroy: 0, replace: 0, total: 0 };

  it("renders a table header", () => {
    const output = render(emptySummary);
    expect(output).toContain("| Action | Count |");
  });

  it("always renders the Total row", () => {
    const output = render(emptySummary);
    expect(output).toContain("Total");
    expect(output).toContain("**0**");
  });

  it("renders add row only when add > 0", () => {
    const output = render({ ...emptySummary, add: 3, total: 3 });
    expect(output).toContain("3");
    expect(output).toMatch(/Add/);
  });

  it("renders change row only when change > 0", () => {
    const output = render({ ...emptySummary, change: 2, total: 2 });
    expect(output).toMatch(/Change/);
  });

  it("renders destroy row only when destroy > 0", () => {
    const output = render({ ...emptySummary, destroy: 1, total: 1 });
    expect(output).toMatch(/Destroy/);
  });

  it("renders replace row only when replace > 0", () => {
    const output = render({ ...emptySummary, replace: 1, total: 1 });
    expect(output).toMatch(/Replace/);
  });

  it("omits add row when add is 0", () => {
    const output = render(emptySummary);
    expect(output).not.toMatch(/Add/);
  });

  it("includes action symbols", () => {
    const output = render({ ...emptySummary, add: 1, total: 1 });
    expect(output).toContain("➕");
  });

  it("renders all action types when all are nonzero", () => {
    const summary: Summary = { add: 1, change: 2, destroy: 3, replace: 4, total: 10 };
    const output = render(summary);
    expect(output).toMatch(/Add/);
    expect(output).toMatch(/Change/);
    expect(output).toMatch(/Destroy/);
    expect(output).toMatch(/Replace/);
    expect(output).toContain("**10**");
  });
});
