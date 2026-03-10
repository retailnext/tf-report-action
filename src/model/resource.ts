import type { PlanAction } from "./plan-action.js";
import type { AttributeChange } from "./attribute.js";

export interface ResourceChange {
  address: string;
  moduleAddress: string | null;
  type: string;
  name: string;
  action: PlanAction;
  actionReason: string | null;
  attributes: AttributeChange[];
  /** Present when the resource is being imported. */
  importId: string | null;
  /** Present when the resource was moved from another address. */
  movedFromAddress: string | null;
  /** True when all attribute values will only be known after apply. */
  allUnknownAfterApply: boolean;
}
