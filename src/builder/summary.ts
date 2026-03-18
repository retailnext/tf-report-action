import type { ResourceChange } from "../model/resource.js";
import type { PlanAction } from "../model/plan-action.js";
import type {
  Summary,
  SummaryActionGroup,
  ResourceTypeCount,
} from "../model/summary.js";
import type { PlannedChange } from "../jsonl-scanner/types.js";

/** Actions that count toward summary totals, in display order. */
const SUMMARY_ACTIONS: readonly PlanAction[] = [
  "create",
  "update",
  "replace",
  "delete",
  "move",
  "import",
  "forget",
];

/**
 * Builds a plan summary: groups resources by action and resource type.
 * Read, open, and unknown actions are excluded. True no-op resources
 * should already be filtered out by the builder before reaching here.
 */
export function buildSummary(resources: readonly ResourceChange[]): Summary {
  return {
    actions: buildActionGroups(resources, SUMMARY_ACTIONS),
    failures: [],
  };
}

/**
 * Builds an apply summary: successful resources go into `actions`,
 * failed resources go into `failures`, each grouped by action and resource type.
 */
export function buildApplySummary(
  resources: readonly ResourceChange[],
  failedAddresses: ReadonlySet<string>,
): Summary {
  const succeeded = resources.filter((r) => !failedAddresses.has(r.address));
  const failed = resources.filter((r) => failedAddresses.has(r.address));

  return {
    actions: buildActionGroups(succeeded, SUMMARY_ACTIONS),
    failures: buildActionGroups(failed, SUMMARY_ACTIONS),
  };
}

/**
 * Groups resources by action then by resource type, returning one
 * `SummaryActionGroup` per action that has at least one resource.
 * Resource types within each group are sorted by count descending,
 * then alphabetically.
 */
function buildActionGroups(
  resources: readonly ResourceChange[],
  actionOrder: readonly PlanAction[],
): SummaryActionGroup[] {
  // Bucket resources by action → resource type
  const buckets = new Map<PlanAction, Map<string, number>>();
  const actionSet = new Set<PlanAction>(actionOrder);

  for (const r of resources) {
    if (!actionSet.has(r.action)) continue;
    let typeCounts = buckets.get(r.action);
    if (!typeCounts) {
      typeCounts = new Map();
      buckets.set(r.action, typeCounts);
    }
    typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
  }

  const groups: SummaryActionGroup[] = [];
  for (const action of actionOrder) {
    const typeCounts = buckets.get(action);
    if (!typeCounts) continue;

    const resourceTypes: ResourceTypeCount[] = [...typeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

    const total = resourceTypes.reduce((sum, rt) => sum + rt.count, 0);
    groups.push({ action, resourceTypes, total });
  }

  return groups;
}

/**
 * Builds a plan Summary from JSONL scanner output. Uses `PlannedChange`
 * records which carry action and resource type but no attribute detail.
 *
 * Produces the same `Summary` shape as `buildSummary` — the renderer
 * cannot distinguish a summary from plan JSON vs JSONL.
 */
export function buildSummaryFromScan(
  changes: readonly PlannedChange[],
): Summary {
  return {
    actions: buildActionGroupsFromScan(changes, SUMMARY_ACTIONS),
    failures: [],
  };
}

/**
 * Groups PlannedChange records by action and resource type, identical
 * in output shape to `buildActionGroups` for ResourceChange.
 */
function buildActionGroupsFromScan(
  changes: readonly PlannedChange[],
  actionOrder: readonly PlanAction[],
): SummaryActionGroup[] {
  const buckets = new Map<PlanAction, Map<string, number>>();
  const actionSet = new Set<PlanAction>(actionOrder);

  for (const c of changes) {
    if (!actionSet.has(c.action)) continue;
    let typeCounts = buckets.get(c.action);
    if (!typeCounts) {
      typeCounts = new Map();
      buckets.set(c.action, typeCounts);
    }
    typeCounts.set(c.resourceType, (typeCounts.get(c.resourceType) ?? 0) + 1);
  }

  const groups: SummaryActionGroup[] = [];
  for (const action of actionOrder) {
    const typeCounts = buckets.get(action);
    if (!typeCounts) continue;

    const resourceTypes: ResourceTypeCount[] = [...typeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

    const total = resourceTypes.reduce((sum, rt) => sum + rt.count, 0);
    groups.push({ action, resourceTypes, total });
  }

  return groups;
}
