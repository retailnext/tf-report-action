/**
 * Workflow element — renders step outcomes as a fixed section when no
 * plan/apply output is available at all (Tier 4).
 */

import type { OutputFormat } from "../model/renderable.js";
import type { ReportElement } from "../renderable/types.js";
import type { StepOutcome } from "../model/step-outcome.js";
import { Heading, EMPTY } from "../renderable/primitives.js";
import { buildStepTable } from "./step-table.js";

/**
 * A workflow-only section with step status table.
 * Always included at full detail (fixed).
 */
export class WorkflowElement implements ReportElement {
  readonly id = "step-table";
  readonly fixed = true;
  readonly levels = 1;

  private readonly steps: readonly StepOutcome[];

  constructor(steps: readonly StepOutcome[]) {
    this.steps = steps;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat, _level: number): number {
    return this.render(format, 0).length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat, _level: number): string {
    const table = buildStepTable(this.steps);
    if (table === EMPTY) return "";
    return new Heading("Steps", 3).render(format) + table.render(format);
  }
}
