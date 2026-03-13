import type { PlanAction } from "./plan-action.js";

/**
 * Tracks the apply outcome for a single resource. Built from
 * `apply_start` / `apply_complete` / `apply_errored` UI messages.
 *
 * Used by the renderer to show ✅ or ❌ status per resource and
 * to include error details for failed resources.
 */
export interface ApplyStatus {
  /** Full resource address (e.g. "module.child.aws_instance.web[0]"). */
  readonly address: string;
  /** The apply action that was attempted. */
  readonly action: PlanAction;
  /** Whether the apply operation completed successfully. */
  readonly success: boolean;
  /** Wall-clock time the operation took (seconds). */
  readonly elapsed?: number;
  /** Primary key attribute name (e.g. "id"). */
  readonly idKey?: string;
  /** Primary key attribute value. */
  readonly idValue?: string;
}
