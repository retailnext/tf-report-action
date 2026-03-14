import { describe, it, expect } from "vitest";
import { renderStepStatusTable } from "../../../src/renderer/step-table.js";
import type { StepOutcome } from "../../../src/model/step-outcome.js";

describe("renderStepStatusTable", () => {
  it("renders a markdown table from step outcomes", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
      { id: "plan", outcome: "failure" },
    ];
    const result = renderStepStatusTable(steps);
    expect(result).toContain("| Step | Outcome |");
    expect(result).toContain("| `init` | success |");
    expect(result).toContain("| `plan` | failure |");
  });

  it("returns empty string for empty steps array", () => {
    expect(renderStepStatusTable([])).toBe("");
  });

  it("excludes steps whose IDs are in the excludeIds set", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
      { id: "validate", outcome: "success" },
      { id: "plan", outcome: "failure" },
    ];
    const result = renderStepStatusTable(steps, new Set(["init", "plan"]));
    expect(result).toContain("| `validate` | success |");
    expect(result).not.toContain("| `init`");
    expect(result).not.toContain("| `plan`");
  });

  it("returns empty string when all steps are excluded", () => {
    const steps: StepOutcome[] = [
      { id: "init", outcome: "success" },
    ];
    const result = renderStepStatusTable(steps, new Set(["init"]));
    expect(result).toBe("");
  });

  it("renders single step correctly", () => {
    const steps: StepOutcome[] = [{ id: "apply", outcome: "cancelled" }];
    const result = renderStepStatusTable(steps);
    expect(result).toContain("| `apply` | cancelled |");
    expect(result).toContain("|------|--------|");
  });
});
