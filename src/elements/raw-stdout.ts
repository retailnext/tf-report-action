/**
 * Raw stdout section element — renders a raw stdout block in a collapsible
 * details section (used when structured + raw content coexist in a report).
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import type { ReportElement } from "../renderable/types.js";
import { Details, HtmlText } from "../renderable/primitives.js";
import { htmlEscape } from "../renderable/html-escape.js";
import { buildRawOutputRenderable } from "./raw-output.js";

/**
 * A collapsible raw stdout section. Always fixed (never degraded).
 */
export class RawStdoutElement implements ReportElement {
  readonly id: string;
  readonly fixed = true;
  readonly levels = 1;

  private readonly renderable: Renderable;

  constructor(stepId: string, label: string, content: string) {
    this.id = `raw-${stepId}`;
    const escapedLabel = htmlEscape(label);
    const formatted = buildRawOutputRenderable(content);
    this.renderable = new Details(new HtmlText(escapedLabel), formatted);
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
