/**
 * Workflow element — renders step outcomes as a fixed section when no
 * plan/apply output is available at all (Tier 4).
 */

import type { OutputFormat } from "../renderable/types.js";
import type { ReportElement } from "../renderable/types.js";
import type { Renderable } from "../renderable/types.js";
import type { StepOutcome } from "../model/step-outcome.js";
import { Heading, Sequence, EMPTY } from "../renderable/primitives.js";
import { buildStepTable } from "./step-table.js";

/**
 * A workflow-only section with step status table.
 * Always included at full detail (fixed).
 */
export class WorkflowElement implements ReportElement {
  readonly id = "step-table";
  readonly fixed = true;
  readonly levels = 1;

  private readonly renderable: Renderable;

  constructor(steps: readonly StepOutcome[]) {
    const table = buildStepTable(steps);
    if (table === EMPTY) {
      this.renderable = EMPTY;
    } else {
      this.renderable = new Sequence([new Heading("Steps", 3), table]);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat, _level: number): number {
    return this.renderable.size(format);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat, _level: number): string {
    return this.renderable.render(format);
  }
}
