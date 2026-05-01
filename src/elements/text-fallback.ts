/**
 * Text-fallback element — renders raw stdout blocks when no structured
 * plan data is available (Tier 3).
 *
 * Has 2 levels:
 * - Level 0 (compact): heading + "(omitted due to size)" placeholder
 * - Level 1 (full): heading + formatted raw output
 */

import type { Renderable, OutputFormat } from "../model/renderable.js";
import type { ReportElement } from "../renderable/types.js";
import { Heading, Sequence } from "../renderable/primitives.js";
import { renderNote } from "../renderable/helpers.js";
import { buildRawOutputRenderable } from "./raw-output.js";

/**
 * A raw stdout block with 2 detail levels.
 */
export class TextFallbackElement implements ReportElement {
  readonly id: string;
  readonly fixed = false;
  readonly levels = 2;

  private readonly heading: Renderable;
  private readonly full: Renderable;
  private readonly noteText = "omitted due to size";

  constructor(stepId: string, label: string, content: string) {
    this.id = `raw-${stepId}`;

    this.heading = new Heading(label, 3);
    this.full = new Sequence([this.heading, buildRawOutputRenderable(content)]);
  }

  size(format: OutputFormat, level: number): number {
    if (level === 0) {
      return (
        this.heading.size(format) + renderNote(this.noteText, format).length
      );
    }
    return this.full.size(format);
  }

  render(format: OutputFormat, level: number): string {
    if (level === 0) {
      return this.heading.render(format) + renderNote(this.noteText, format);
    }
    return this.full.render(format);
  }
}
