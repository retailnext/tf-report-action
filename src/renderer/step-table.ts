/**
 * Step status table renderer — converts StepOutcome arrays into markdown tables.
 *
 * Used by text-fallback, workflow, and error report renderers when they
 * need to show step statuses.
 */

import type { StepOutcome } from "../model/step-outcome.js";

/**
 * Render a markdown table of step outcomes.
 *
 * @param steps - Array of step outcomes to render
 * @param excludeIds - Optional set of step IDs to exclude (already rendered elsewhere)
 * @returns A markdown table string, or empty string if no steps to show
 */
export function renderStepStatusTable(
  steps: readonly StepOutcome[],
  excludeIds?: ReadonlySet<string>,
): string {
  const filtered = excludeIds
    ? steps.filter((s) => !excludeIds.has(s.id))
    : steps;

  if (filtered.length === 0) return "";

  let table = "| Step | Outcome |\n|------|--------|\n";
  for (const step of filtered) {
    table += `| \`${step.id}\` | ${step.outcome} |\n`;
  }
  return table + "\n";
}
