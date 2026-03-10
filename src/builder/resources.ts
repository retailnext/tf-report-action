import type { ResourceChange as TFResourceChange } from "../tfjson/resource.js";
import type { Plan } from "../tfjson/plan.js";
import type { ResourceChange as ModelResourceChange } from "../model/resource.js";
import type { BuildOptions } from "./options.js";
import type { ConfigRefIndex } from "./config-refs.js";
import { determineAction } from "./action.js";
import { buildAttributeChanges } from "./attributes.js";
import { KNOWN_AFTER_APPLY } from "./attributes.js";

/**
 * Maps each entry in plan.resource_changes to a ModelResourceChange.
 * Skips data sources with only a "read" action.
 */
export function buildResourceChanges(
  plan: Plan,
  configRefs: ConfigRefIndex,
  options: BuildOptions,
): ModelResourceChange[] {
  const resourceChanges = plan.resource_changes ?? [];
  const result: ModelResourceChange[] = [];

  for (const rc of resourceChanges) {
    if (shouldSkip(rc)) continue;

    const action = determineAction(rc.change.actions);
    const address = rc.address ?? `${rc.type ?? "unknown"}.${rc.name ?? "unknown"}`;

    const attributes = buildAttributeChanges(rc.change, address, configRefs, options);

    // Determine if all attributes are known after apply
    const allUnknownAfterApply = isAllUnknownAfterApply(rc, attributes);

    result.push({
      address,
      moduleAddress: rc.module_address ?? null,
      type: rc.type ?? "unknown",
      name: rc.name ?? "unknown",
      action,
      actionReason: rc.action_reason ?? null,
      attributes,
      importId: rc.change.importing?.id ?? null,
      movedFromAddress: rc.previous_address ?? null,
      allUnknownAfterApply,
    });
  }

  return result;
}

function shouldSkip(rc: TFResourceChange): boolean {
  // Skip data sources that are only being read (no real change)
  if (rc.mode === "data") {
    const actions = rc.change.actions;
    if (actions.length === 1 && actions[0] === "read") {
      return true;
    }
  }
  return false;
}

function isAllUnknownAfterApply(
  rc: TFResourceChange,
  attributes: ModelResourceChange["attributes"],
): boolean {
  // If after_unknown is a boolean true at root level, all are unknown
  if (rc.change.after_unknown === true) return true;

  // If there are attributes and all of them are known after apply
  if (attributes.length > 0 && attributes.every((a) => a.after === KNOWN_AFTER_APPLY)) {
    return true;
  }

  return false;
}
