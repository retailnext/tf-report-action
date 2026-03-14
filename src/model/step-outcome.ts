/**
 * Lightweight representation of a step's outcome for rendering in
 * status tables and workflow summaries.
 *
 * Decouples the renderer from the steps/ module's internal types.
 */
export interface StepOutcome {
  /** Step identifier (e.g. "init", "plan", "apply"). */
  readonly id: string;

  /** Outcome string (e.g. "success", "failure", "cancelled", "skipped", "unknown"). */
  readonly outcome: string;
}
