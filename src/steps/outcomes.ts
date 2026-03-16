/**
 * Step outcome helpers — pure predicates on step data.
 *
 * These functions extract and classify step outcomes without performing
 * any I/O or rendering.
 */

import type { StepData, Steps } from "./types.js";
import type { StepOutcome } from "../model/step-outcome.js";
import { OUTPUT_EXIT_CODE } from "./types.js";

/** Get the effective outcome of a step (prefers `outcome` over `conclusion`). */
export function getStepOutcome(step: StepData): string {
  return step.outcome ?? step.conclusion ?? "unknown";
}

/** Get the exit code string from a step's outputs, if present. */
export function getExitCode(step: StepData): string | undefined {
  return step.outputs?.[OUTPUT_EXIT_CODE] ?? undefined;
}

/** Check if any step outside the known IaC step IDs has failed. */
export function hasAnyFailedStep(
  steps: Steps,
  knownStepIds: ReadonlySet<string>,
): boolean {
  return Object.entries(steps).some(
    ([id, step]) => !knownStepIds.has(id) && getStepOutcome(step) === "failure",
  );
}

/** Check if any known IaC step (init, validate, plan, etc.) has failed. */
export function hasAnyFailedKnownStep(
  steps: Steps,
  knownStepIds: ReadonlySet<string>,
): boolean {
  return Object.entries(steps).some(
    ([id, step]) => knownStepIds.has(id) && getStepOutcome(step) === "failure",
  );
}

/** Build a StepOutcome array from a Steps record, optionally excluding specific IDs. */
export function buildStepOutcomes(
  steps: Steps,
  excludeIds?: ReadonlySet<string>,
): StepOutcome[] {
  return Object.entries(steps)
    .filter(([id]) => !excludeIds?.has(id))
    .map(([id, step]) => {
      const outcome = getStepOutcome(step);
      const exitCode = getExitCode(step);
      const result: StepOutcome = { id, outcome };
      if (exitCode !== undefined)
        (result as { exitCode: string }).exitCode = exitCode;
      return result;
    });
}
