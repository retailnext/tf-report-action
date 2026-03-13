import type { PlanAction } from "./plan-action.js";

/** Count of resources of a specific type within an action group. */
export interface ResourceTypeCount {
  readonly type: string;
  readonly count: number;
}

/**
 * A group of resource changes sharing the same action (e.g. all "create"
 * operations). Contains a breakdown by resource type and a pre-computed total.
 */
export interface SummaryActionGroup {
  readonly action: PlanAction;
  readonly resourceTypes: readonly ResourceTypeCount[];
  /** Sum of all `resourceTypes[].count` values. */
  readonly total: number;
}

/**
 * Summary of a plan or apply report, structured as action groups with
 * per-resource-type breakdowns.
 *
 * For plan reports `failures` is always empty. For apply reports,
 * resources that failed are separated into `failures` grouped by the
 * action that was attempted.
 */
export interface Summary {
  /** Successful (or planned) operations grouped by action type. */
  readonly actions: readonly SummaryActionGroup[];
  /** Failed operations grouped by original planned action (apply only). */
  readonly failures: readonly SummaryActionGroup[];
}
