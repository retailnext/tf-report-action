import type { PlanAction } from "./plan-action.js";

export interface OutputChange {
  name: string;
  action: PlanAction;
  before: string | null;
  after: string | null;
  isSensitive: boolean;
}
