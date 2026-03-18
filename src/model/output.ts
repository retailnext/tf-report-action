import type { PlanAction } from "./plan-action.js";

export interface OutputChange {
  name: string;
  action: PlanAction;
  before: string | null;
  after: string | null;
  isSensitive: boolean;
  /** True when the after value is a placeholder (known after apply / value not in plan). */
  isKnownAfterApply: boolean;
}
