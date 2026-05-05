/**
 * Error element — renders error-state reports with an error message
 * and optional step status table.
 */

import type { OutputFormat } from "../model/renderable.js";
import type { ReportElement } from "../renderable/types.js";
import type { StepOutcome } from "../model/step-outcome.js";
import { Heading, EMPTY } from "../renderable/primitives.js";
import { htmlEscape } from "../renderable/html-escape.js";
import { markdownEscape } from "../renderable/markdown-escape.js";
import { buildStepTable } from "./step-table.js";

/**
 * An error message element. Always fixed.
 */
export class ErrorMessageElement implements ReportElement {
  readonly id = "message";
  readonly fixed = true;
  readonly levels = 1;

  private readonly message: string;

  constructor(message: string) {
    this.message = message;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat, _level: number): number {
    return this.render(format, 0).length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat, _level: number): string {
    if (format === "markdown") {
      return `${markdownEscape(this.message)}\n\n`;
    }
    return `<p>${htmlEscape(this.message)}</p>\n`;
  }
}

/**
 * A step status section for error reports. Always fixed.
 */
export class ErrorStepTableElement implements ReportElement {
  readonly id = "step-statuses";
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
