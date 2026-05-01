/**
 * Raw stdout section element — renders a raw stdout block in a collapsible
 * details section (used when structured + raw content coexist in a report).
 */

import type { OutputFormat } from "../model/renderable.js";
import type { ReportElement } from "../renderable/types.js";
import { Details } from "../renderable/primitives.js";
import { detailsSummary } from "../renderable/helpers.js";
import { buildRawOutputRenderable } from "./raw-output.js";

/**
 * A collapsible raw stdout section. Always fixed (never degraded).
 */
export class RawStdoutElement implements ReportElement {
  readonly id: string;
  readonly fixed = true;
  readonly levels = 1;

  private readonly label: string;
  private readonly content: string;

  constructor(stepId: string, label: string, content: string) {
    this.id = `raw-${stepId}`;
    this.label = label;
    this.content = content;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat, _level: number): number {
    return this.render(format, 0).length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat, _level: number): string {
    const summary = detailsSummary(this.label);
    const formatted = buildRawOutputRenderable(this.content);
    return new Details(summary, formatted).render(format);
  }
}
