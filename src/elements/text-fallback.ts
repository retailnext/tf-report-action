/**
 * Text-fallback element — renders raw stdout blocks when no structured
 * plan data is available (Tier 3).
 *
 * Has 2 levels:
 * - Level 0 (compact): heading + "(omitted due to size)" placeholder
 * - Level 1 (full): heading + formatted raw output
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import type { ReportElement } from "../renderable/types.js";
import { Heading, Paragraph, Sequence } from "../renderable/primitives.js";
import { buildRawOutputRenderable } from "./raw-output.js";

/**
 * A raw stdout block with 2 detail levels.
 */
export class TextFallbackElement implements ReportElement {
  readonly id: string;
  readonly fixed = false;
  readonly levels = 2;

  private readonly compact: Renderable;
  private readonly full: Renderable;

  constructor(stepId: string, label: string, content: string) {
    this.id = `raw-${stepId}`;

    const headingRenderable = new Heading(label, 3);
    this.compact = new Sequence([
      headingRenderable,
      new Paragraph("_(omitted due to size)_"),
    ]);
    this.full = new Sequence([
      headingRenderable,
      buildRawOutputRenderable(content),
    ]);
  }

  size(format: OutputFormat, level: number): number {
    const r = level === 0 ? this.compact : this.full;
    return r.size(format);
  }

  render(format: OutputFormat, level: number): string {
    const r = level === 0 ? this.compact : this.full;
    return r.render(format);
  }
}
