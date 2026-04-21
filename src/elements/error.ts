/**
 * Error element — renders error-state reports with an error message
 * and optional step status table.
 */

import type { OutputFormat } from "../renderable/types.js";
import type { ReportElement } from "../renderable/types.js";
import type { Renderable } from "../renderable/types.js";
import type { StepOutcome } from "../model/step-outcome.js";
import {
  Heading,
  Paragraph,
  Sequence,
  EMPTY,
} from "../renderable/primitives.js";
import { buildStepTable } from "./step-table.js";

/**
 * An error message element. Always fixed.
 */
export class ErrorMessageElement implements ReportElement {
  readonly id = "message";
  readonly fixed = true;
  readonly levels = 1;

  private readonly renderable: Renderable;

  constructor(message: string) {
    this.renderable = new Paragraph(message);
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

/**
 * A step status section for error reports. Always fixed.
 */
export class ErrorStepTableElement implements ReportElement {
  readonly id = "step-statuses";
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
