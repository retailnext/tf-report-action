import type { PlanAction } from "./plan-action.js";
import type { AttributeChange } from "./attribute.js";

/**
 * A single resource change in a plan or apply report.
 *
 * Resources are identified solely by their fully-qualified `address`.
 * Display concerns (module grouping, instance name) are derived by the
 * renderer from `address` and `type`.
 */
export interface ResourceChange {
  /** Fully-qualified resource address (e.g. "module.child.aws_instance.web[0]"). */
  address: string;
  /** Resource type (e.g. "aws_instance"). Needed for summary grouping and display derivation. */
  type: string;
  action: PlanAction;
  actionReason: string | null;
  attributes: AttributeChange[];
  /**
   * Whether attribute detail (before/after values) is available.
   *
   * `true` for resources built from show-plan JSON (full attribute detail).
   * `false` for resources built from JSONL scanning (action and address only).
   * The renderer uses this to avoid showing "No attribute changes." when
   * attributes are simply unavailable rather than genuinely unchanged.
   */
  hasAttributeDetail: boolean;
  /** Present when the resource is being imported. */
  importId: string | null;
  /** Present when the resource was moved from another address. */
  movedFromAddress: string | null;
  /** True when all attribute values will only be known after apply. */
  allUnknownAfterApply: boolean;
}
