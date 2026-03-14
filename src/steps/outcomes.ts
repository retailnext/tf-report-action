/**
 * Step outcome helpers — pure predicates on step data.
 *
 * These functions extract and classify step outcomes without performing
 * any I/O or rendering.
 */

import type { StepData, Steps } from "./types.js";
import type { StepOutcome } from "../model/step-outcome.js";

/** Get the effective outcome of a step (prefers `outcome` over `conclusion`). */
export function getStepOutcome(step: StepData): string {
  return step.outcome ?? step.conclusion ?? "unknown";
}

/** Check if any step outside the known IaC step IDs has failed. */
export function hasAnyFailedStep(steps: Steps, knownStepIds: ReadonlySet<string>): boolean {
  return Object.entries(steps).some(
    ([id, step]) => !knownStepIds.has(id) && getStepOutcome(step) === "failure",
  );
}

/** Check if any known IaC step (init, validate, plan, etc.) has failed. */
export function hasAnyFailedKnownStep(steps: Steps, knownStepIds: ReadonlySet<string>): boolean {
  return Object.entries(steps).some(
    ([id, step]) => knownStepIds.has(id) && getStepOutcome(step) === "failure",
  );
}

/** Build a StepOutcome array from a Steps record, optionally excluding specific IDs. */
export function buildStepOutcomes(steps: Steps, excludeIds?: ReadonlySet<string>): StepOutcome[] {
  return Object.entries(steps)
    .filter(([id]) => !excludeIds?.has(id))
    .map(([id, step]) => ({
      id,
      outcome: getStepOutcome(step),
    }));
}
