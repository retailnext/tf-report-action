import type { ResourceChange as TFResourceChange } from "../tfjson/resource.js";
import type { Plan, Change } from "../tfjson/plan.js";
import type { ResourceChange as ModelResourceChange } from "../model/resource.js";
import type { PlanAction } from "../model/plan-action.js";
import type { BuildOptions } from "./options.js";
import type { PlannedChange } from "../jsonl-scanner/types.js";
import { determineAction } from "./action.js";
import { buildAttributeChanges } from "./attributes.js";
import { flatten } from "../flattener/index.js";
import { createDefaultDriftRuleRegistry } from "../drift-filter/registry.js";

/**
 * Refine a base action using resource metadata.
 *
 * - `no-op` with `previous_address` → `move` (moved block)
 * - `no-op` with `importing` → `import` (import block, no other changes)
 * - Other `no-op` → remains `no-op` (filtered out by caller)
 */
function refineAction(base: PlanAction, rc: TFResourceChange): PlanAction {
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
  options: BuildOptions,
): ModelResourceChange[] {
  const resourceChanges = plan.resource_changes ?? [];
  const result: ModelResourceChange[] = [];

  for (const rc of resourceChanges) {
    if (shouldSkip(rc)) continue;

    const action = refineAction(determineAction(rc.change.actions), rc);
    if (action === "no-op") continue;

    const address =
      rc.address ?? `${rc.type ?? "unknown"}.${rc.name ?? "unknown"}`;

    const attributes = buildAttributeChanges(rc.change, options);

    // Determine if all attributes are known after apply
    const allUnknownAfterApply = isAllUnknownAfterApply(rc, attributes);

    result.push({
      address,
      type: rc.type ?? "unknown",
      action,
      actionReason: rc.action_reason ?? null,
      attributes,
      hasAttributeDetail: true,
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
 * Drift entries are passed through the drift suppression registry; by default,
 * data sources and other unimportant drift are omitted.
 *
 * Drift entries with no visible attribute changes are suppressed — they
 * provide no actionable information. This relies on full before/after data
 * being available in the plan JSON (always the case for `resource_drift`
 * entries from `tofu show -json`). Move and import entries are exempt
 * because they carry meaningful non-attribute information.
 */
export function buildDriftChanges(
  plan: Plan,
  options: BuildOptions,
): ModelResourceChange[] {
  const driftChanges = plan.resource_drift ?? [];
  const result: ModelResourceChange[] = [];
  const registry =
    options.driftRuleRegistry ?? createDefaultDriftRuleRegistry();

  for (const rc of driftChanges) {
    const action = refineAction(determineAction(rc.change.actions), rc);
    const address =
      rc.address ?? `${rc.type ?? "unknown"}.${rc.name ?? "unknown"}`;

    const attributes = buildAttributeChanges(rc.change, options);
    const allAttributesForSuppression = buildAttributeChanges(rc.change, {
      ...options,
      showUnchangedAttributes: true,
    });
    const allUnknownAfterApply = isAllUnknownAfterApply(rc, attributes);

    if (
      registry.shouldSuppressDrift(
        rc.type ?? "unknown",
        rc.mode ?? "managed",
        allAttributesForSuppression,
      )
    )
      continue;

    // Suppress drift with no actual value changes. Compares raw (unmasked)
    // before/after values so sensitive attributes that genuinely differ are
    // correctly detected. Independent of showUnchangedAttributes. Move/import
    // entries are kept because they carry meaningful non-attribute information.
    if (
      !hasRawValueChanges(rc.change) &&
      action !== "move" &&
      action !== "import"
    )
      continue;

    result.push({
      address,
      type: rc.type ?? "unknown",
      action,
      actionReason: rc.action_reason ?? null,
      attributes,
      hasAttributeDetail: true,
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

/**
 * Compares raw (unmasked) before/after values to detect actual changes.
 *
 * Flattens `change.before` and `change.after` into string maps and compares
 * them directly — no masking, no sensitivity handling. This ensures the
 * suppression decision reflects real value differences, not display artifacts.
 *
 * Returns `true` if the values actually differ (drift should be kept).
 */
function hasRawValueChanges(change: Change): boolean {
  const before = change.before ?? null;
  const after = change.after ?? null;

  // One side null, other not — definitely changed (create/delete)
  if ((before === null) !== (after === null)) return true;

  // Both null — no change
  if (before === null && after === null) return false;

  // Any after_unknown values mean we can't determine equality — assume changed
  if (change.after_unknown === true) return true;
  if (
    typeof change.after_unknown === "object" &&
    Object.keys(change.after_unknown).length > 0
  )
    return true;

  const beforeFlat = flatten(before);
  const afterFlat = flatten(after);

  if (beforeFlat.size !== afterFlat.size) return true;

  for (const [key, beforeVal] of beforeFlat) {
    if (!afterFlat.has(key)) return true;
    if (beforeVal !== afterFlat.get(key)) return true;
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
 * Builds a flat ResourceChange[] from JSONL scanner planned changes.
 *
 * Resources have no attribute detail (JSONL does not carry before/after
 * values), so `hasAttributeDetail` is set to `false`. The renderer uses
 * this to avoid showing "No attribute changes." for these resources.
 *
 * Data source filtering is not needed here — the scanner only extracts
 * managed resource planned_change messages (data sources don't emit them).
 */
export function buildResourcesFromScan(
  changes: readonly PlannedChange[],
): ModelResourceChange[] {
  const result: ModelResourceChange[] = [];

  for (const change of changes) {
    // Skip no-op (shouldn't appear in JSONL, but be safe)
    if (change.action === "no-op") continue;

    result.push({
      address: change.address,
      type: change.resourceType,
      action: change.action,
      actionReason: change.reason ?? null,
      attributes: [],
      hasAttributeDetail: false,
      importId: null,
      movedFromAddress: null,
      allUnknownAfterApply: false,
    });
  }

  return result;
}
