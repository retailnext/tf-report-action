/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

import type { ChangeActions } from "../tfjson/common.js";
import type { PlanAction } from "../model/plan-action.js";

/**
 * Derives a single PlanAction from a resource change's actions array.
 * ["create","delete"] and ["delete","create"] both map to "replace".
 */
export function determineAction(actions: ChangeActions): PlanAction {
  const [first, second] = actions;

  if (second !== undefined) {
    // All valid multi-element ChangeActions tuples (["delete","create"],
    // ["create","delete"], ["create","forget"]) are replace variants.
    return "replace";
  }

  switch (first) {
    case "create":
      return "create";
    case "delete":
      return "delete";
    case "update":
      return "update";
    case "no-op":
      return "no-op";
    case "read":
      return "read";
    case "forget":
      return "forget";
  }

  // Unreachable for valid ChangeActions, but handles empty/unknown runtime values
  return "unknown";
}
