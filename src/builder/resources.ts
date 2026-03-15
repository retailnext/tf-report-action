import type { ResourceChange as TFResourceChange } from "../tfjson/resource.js";
import type { Plan } from "../tfjson/plan.js";
import type { ResourceChange as ModelResourceChange } from "../model/resource.js";
import type { ModuleGroup } from "../model/module-group.js";
import type { PlanAction } from "../model/plan-action.js";
import type { BuildOptions } from "./options.js";
import type { ConfigRefIndex } from "./config-refs.js";
import type { PlannedChange } from "../jsonl-scanner/types.js";
import { determineAction } from "./action.js";
import { buildAttributeChanges } from "./attributes.js";

/**
 * Refine a base action using resource metadata.
 *
 * - `no-op` with `previous_address` → `move` (moved block)
 * - `no-op` with `importing` → `import` (import block, no other changes)
 * - Other `no-op` → remains `no-op` (filtered out by caller)
 */
function refineAction(
  base: PlanAction,
  rc: TFResourceChange,
): PlanAction {
  if (base !== "no-op") return base;
  if (rc.previous_address) return "move";
  if (rc.change.importing) return "import";
  return "no-op";
}

/**
 * Maps each entry in plan.resource_changes to a ModelResourceChange.
 * Data sources are always excluded — errors relating to data sources
 * surface through the diagnostics section instead.
 * True no-op resources (unchanged, not moved or imported) are excluded —
 * they provide no useful information in the report.
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

    const action = refineAction(determineAction(rc.change.actions), rc);
    if (action === "no-op") continue;

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

/**
 * Maps each entry in plan.resource_drift to a ModelResourceChange.
 * Uses the same transformation as buildResourceChanges — drift entries
 * use the same ResourceChange schema, just from a different source field.
 * Data sources are excluded, same as for planned changes.
 * No-op drift entries are kept (drift detection is always informational).
 */
export function buildDriftChanges(
  plan: Plan,
  configRefs: ConfigRefIndex,
  options: BuildOptions,
): ModelResourceChange[] {
  const driftChanges = plan.resource_drift ?? [];
  const result: ModelResourceChange[] = [];

  for (const rc of driftChanges) {
    if (shouldSkip(rc)) continue;

    const action = refineAction(determineAction(rc.change.actions), rc);
    const address = rc.address ?? `${rc.type ?? "unknown"}.${rc.name ?? "unknown"}`;

    const attributes = buildAttributeChanges(rc.change, address, configRefs, options);
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
  // Data sources are never shown in plan or apply reports. Errors relating
  // to data sources surface through the diagnostics section instead.
  if (rc.mode === "data") {
    return true;
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
  if (attributes.length > 0 && attributes.every((a) => a.isKnownAfterApply)) {
    return true;
  }

  return false;
}

/**
 * Builds ModuleGroup[] from JSONL scanner planned changes. Resources have
 * no attribute detail (JSONL does not carry before/after values), but the
 * renderer handles this by showing action + address only for attribute-less
 * resources.
 *
 * Groups resources by module address, same as the show-plan JSON path.
 * Data source filtering is not needed here — the scanner only extracts
 * managed resource planned_change messages (data sources don't emit them).
 */
export function buildModulesFromScan(changes: readonly PlannedChange[]): ModuleGroup[] {
  const groupMap = new Map<string, ModelResourceChange[]>();

  for (const change of changes) {
    // Skip no-op (shouldn't appear in JSONL, but be safe)
    if (change.action === "no-op") continue;

    const moduleAddr = change.module;
    let resources = groupMap.get(moduleAddr);
    if (!resources) {
      resources = [];
      groupMap.set(moduleAddr, resources);
    }

    // Extract resource name from address (after the last dot that isn't inside brackets)
    const name = extractResourceName(change.address);

    resources.push({
      address: change.address,
      moduleAddress: moduleAddr || null,
      type: change.resourceType,
      name,
      action: change.action,
      actionReason: change.reason ?? null,
      attributes: [],
      importId: null,
      movedFromAddress: null,
      allUnknownAfterApply: false,
    });
  }

  // Sort modules: root first, then alphabetically
  const sortedModules = [...groupMap.entries()].sort(([a], [b]) => {
    if (a === "") return -1;
    if (b === "") return 1;
    return a.localeCompare(b);
  });

  return sortedModules.map(([moduleAddress, resources]) => ({
    moduleAddress,
    resources,
    outputs: [],
  }));
}

/**
 * Extracts the resource name from a full resource address.
 * Example: "module.child.aws_instance.web[0]" → "web"
 */
function extractResourceName(address: string): string {
  // Remove any index suffix like [0] or ["key"]
  const withoutIndex = address.replace(/\[.*\]$/, "");
  // Take everything after the last dot
  const lastDot = withoutIndex.lastIndexOf(".");
  return lastDot >= 0 ? withoutIndex.slice(lastDot + 1) : withoutIndex;
}
