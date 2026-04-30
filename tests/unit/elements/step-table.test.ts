import { describe, expect, it } from "vitest";
import type { Renderable } from "../../../src/renderable/types.js";
import { EMPTY } from "../../../src/renderable/primitives.js";
import { buildStepTable } from "../../../src/elements/step-table.js";
import type { StepOutcome } from "../../../src/model/step-outcome.js";

function assertSizeInvariant(node: Renderable, label?: string): void {
  for (const fmt of ["markdown", "html"] as const) {
    const rendered = node.render(fmt);
    expect(node.size(fmt), `${label ?? "node"} size(${fmt})`).toBe(
      rendered.length,
    );
  }
}

describe("buildStepTable", () => {
  it("returns EMPTY when steps is empty", () => {
    const result = buildStepTable([]);
    expect(result).toBe(EMPTY);
    expect(result.size("markdown")).toBe(0);
    expect(result.size("html")).toBe(0);
  });

  it("returns EMPTY when all steps are excluded", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
      { id: "plan", outcome: "success" },
    ];
    const exclude = new Set(["init", "plan"]);
    const result = buildStepTable(steps, exclude);
    expect(result).toBe(EMPTY);
  });

  it("builds a 2-column table when no exit codes present", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
      { id: "plan", outcome: "failure" },
    ];
    const result = buildStepTable(steps);
    const md = result.render("markdown");
    expect(md).toContain("| Step | Outcome |");
    expect(md).toContain("| `init` | success |");
    expect(md).toContain("| `plan` | failure |");
    // No Exit Code column
    expect(md).not.toContain("Exit Code");
  });

  it("builds a 3-column table when any step has exitCode", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
      { id: "plan", outcome: "failure", exitCode: "1" },
    ];
    const result = buildStepTable(steps);
    const md = result.render("markdown");
    expect(md).toContain("| Step | Outcome | Exit Code |");
    expect(md).toContain("`plan`");
    expect(md).toContain("`1`");
  });

  it("wraps step IDs in backticks for markdown", () => {
    const steps: StepOutcome[] = [{ id: "apply", outcome: "success" }];
    const result = buildStepTable(steps);
    const md = result.render("markdown");
    expect(md).toContain("`apply`");
  });

  it("wraps step IDs in <code> tags for HTML", () => {
    const steps: StepOutcome[] = [{ id: "apply", outcome: "success" }];
    const result = buildStepTable(steps);
    const html = result.render("html");
    expect(html).toContain("<code>apply</code>");
  });

  it("wraps exit codes in backticks for markdown", () => {
    const steps: StepOutcome[] = [
      { id: "plan", outcome: "failure", exitCode: "2" },
    ];
    const result = buildStepTable(steps);
    const md = result.render("markdown");
    expect(md).toContain("`2`");
  });

  it("wraps exit codes in <code> tags for HTML", () => {
    const steps: StepOutcome[] = [
      { id: "plan", outcome: "failure", exitCode: "2" },
    ];
    const result = buildStepTable(steps);
    const html = result.render("html");
    expect(html).toContain("<code>2</code>");
  });

  it("filters out excluded step IDs", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
      { id: "plan", outcome: "success" },
      { id: "apply", outcome: "failure" },
    ];
    const exclude = new Set(["init"]);
    const result = buildStepTable(steps, exclude);
    const md = result.render("markdown");
    expect(md).not.toContain("`init`");
    expect(md).toContain("`plan`");
    expect(md).toContain("`apply`");
  });

  it("satisfies the size invariant for a 2-column table", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
      { id: "plan", outcome: "failure" },
    ];
    assertSizeInvariant(buildStepTable(steps), "2-col-table");
  });

  it("satisfies the size invariant for a 3-column table", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
      { id: "plan", outcome: "failure", exitCode: "1" },
    ];
    assertSizeInvariant(buildStepTable(steps), "3-col-table");
  });

  it("satisfies the size invariant for a single-row table", () => {
    const steps: StepOutcome[] = [{ id: "apply", outcome: "success" }];
    assertSizeInvariant(buildStepTable(steps), "single-row");
  });
});
