/**
 * Step status table — builds a Renderable from step outcomes.
 *
 * Used by text-fallback, workflow, and error elements when they
 * need to show step statuses.
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import type { StepOutcome } from "../model/step-outcome.js";
import { Table, EMPTY } from "../renderable/primitives.js";
import { textCell, codeSpan } from "../renderable/helpers.js";

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

  return new StepOutcomes(filtered);
}

/**
 * Step outcomes — semantic Renderable holding step status data.
 * Renders as a table with step IDs, outcomes, and optional exit codes.
 */
class StepOutcomes implements Renderable {
  private readonly steps: readonly StepOutcome[];
  private readonly hasExitCodes: boolean;

  constructor(steps: readonly StepOutcome[]) {
    this.steps = steps;
    this.hasExitCodes = steps.some((s) => s.exitCode !== undefined);
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    if (this.hasExitCodes) {
      const headers = [
        textCell("Step"),
        textCell("Outcome"),
        textCell("Exit Code"),
      ];
      const rows = this.steps.map((step) => ({
        cells: [
          codeSpan(step.id),
          textCell(step.outcome),
          step.exitCode !== undefined ? codeSpan(step.exitCode) : EMPTY,
        ],
      }));
      return new Table(headers, rows).render(format);
    }

    const headers = [textCell("Step"), textCell("Outcome")];
    const rows = this.steps.map((step) => ({
      cells: [codeSpan(step.id), textCell(step.outcome)],
    }));
    return new Table(headers, rows).render(format);
  }
}
