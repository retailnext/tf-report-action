/**
 * Step status table — builds a Renderable from step outcomes.
 *
 * Used by text-fallback, workflow, and error elements when they
 * need to show step statuses.
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import type { StepOutcome } from "../model/step-outcome.js";
import { Table, RawText, EMPTY } from "../renderable/primitives.js";

/**
 * Builds a step status table as a Renderable.
 *
 * Shows exit codes when any step has one. Filters out excluded step IDs.
 * Returns EMPTY if no steps to show.
 */
export function buildStepTable(
  steps: readonly StepOutcome[],
  excludeIds?: ReadonlySet<string>,
): Renderable {
  const filtered = excludeIds
    ? steps.filter((s) => !excludeIds.has(s.id))
    : steps;

  if (filtered.length === 0) return EMPTY;

  const hasExitCodes = filtered.some((s) => s.exitCode !== undefined);

  if (hasExitCodes) {
    const headers = [
      new RawText("Step"),
      new RawText("Outcome"),
      new RawText("Exit Code"),
    ];
    const rows = filtered.map((step) => ({
      cells: [
        new InlineCode(step.id),
        new RawText(step.outcome),
        step.exitCode !== undefined ? new InlineCode(step.exitCode) : EMPTY,
      ],
    }));
    return new Table(headers, rows);
  }

  const headers = [new RawText("Step"), new RawText("Outcome")];
  const rows = filtered.map((step) => ({
    cells: [new InlineCode(step.id), new RawText(step.outcome)],
  }));
  return new Table(headers, rows);
}

/**
 * Inline code renderable — wraps text in backticks (markdown) or
 * `<code>` tags (HTML). Used for step IDs and exit codes in tables.
 */
class InlineCode implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(text: string) {
    this.mdStr = `\`${text}\``;
    this.htStr = `<code>${text}</code>`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
  }
}
