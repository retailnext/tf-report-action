import { describe, expect, it } from "vitest";
import type { ReportElement } from "../../../src/renderable/types.js";
import { WorkflowElement } from "../../../src/elements/workflow.js";
import type { StepOutcome } from "../../../src/model/step-outcome.js";

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

describe("WorkflowElement", () => {
  it("has correct metadata", () => {
    const el = new WorkflowElement([]);
    expect(el.id).toBe("step-table");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("renders EMPTY for empty steps", () => {
    const el = new WorkflowElement([]);
    expect(el.render("markdown", 0)).toBe("");
    expect(el.render("html", 0)).toBe("");
    expect(el.size("markdown", 0)).toBe(0);
    expect(el.size("html", 0)).toBe(0);
  });

  it("renders heading and table with steps in markdown", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
      { id: "plan", outcome: "success" },
    ];
    const el = new WorkflowElement(steps);
    const md = el.render("markdown", 0);
    expect(md).toContain("### Steps");
    expect(md).toContain("`init`");
    expect(md).toContain("`plan`");
  });

  it("renders heading and table with steps in HTML", () => {
    const steps: StepOutcome[] = [{ id: "init", outcome: "success" }];
    const el = new WorkflowElement(steps);
    const html = el.render("html", 0);
    expect(html).toContain("<h3>Steps</h3>");
    expect(html).toContain("<code>init</code>");
  });

  it("satisfies the size invariant with steps", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
      { id: "plan", outcome: "failure" },
      { id: "apply", outcome: "skipped" },
    ];
    assertElementSizeInvariant(new WorkflowElement(steps), "with-steps");
  });

  it("satisfies the size invariant with empty steps", () => {
    assertElementSizeInvariant(new WorkflowElement([]), "empty-steps");
  });
});
