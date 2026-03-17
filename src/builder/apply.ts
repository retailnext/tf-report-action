/**
 * Builds an apply report by enriching a plan-based Report with actual
 * apply outcomes from a JSONL scan result.
 *
 * The key operation is **phantom filtering**: resources that appear in the
 * plan but were not actually applied are removed from the report. Resources
 * that were actually changed fall into two categories:
 * - Hook-based: had `apply_complete`/`apply_errored` messages (creates,
 *   updates, deletes, replaces).
 * - State-only: no provider call and therefore no apply hooks (forgets, moves,
 *   and state-only imports). These are identified from the plan JSON.
 */

import type { Plan } from "../tfjson/plan.js";
import type { UIOutputsMessage } from "../tfjson/machine-readable-ui.js";
import type { Report } from "../model/report.js";
import type { Diagnostic } from "../model/diagnostic.js";
import type { ApplyStatus } from "../model/apply-status.js";
import type { BuildOptions } from "./options.js";
import type { PlanAction } from "../model/plan-action.js";
import type { ScanResult } from "../jsonl-scanner/types.js";
import { buildReport } from "./index.js";
import { buildApplySummary } from "./summary.js";
import { VALUE_NOT_IN_PLAN } from "../model/sentinels.js";

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Builds a Report enriched with apply outcomes. Starts from a plan-based
 * report and filters/augments it using the apply scan result.
 *
 * @param plan       - Parsed plan JSON (from `show -json`)
 * @param scanResult - Result from scanning apply JSONL
 * @param options    - Build options (same as for plan reports)
 */
export function buildApplyReport(
  plan: Plan,
  scanResult: ScanResult,
  options: BuildOptions = {},
): Report {
  const report = buildReport(plan, options);

  const stateOnlyAddresses = extractStateOnlyAddresses(plan);
  const appliedAddresses = new Set([
    ...scanResult.applyStatuses.map((s) => s.address),
    ...stateOnlyAddresses.keys(),
  ]);

  // Build planned address map from scan result
  const plannedAddresses = new Map<string, PlanAction>();
  for (const change of scanResult.plannedChanges) {
    plannedAddresses.set(change.address, change.action);
  }

  const stateOnlyStatuses = buildStateOnlyStatuses(stateOnlyAddresses);

  // Set diagnostic source to "apply" for all scan diagnostics
  const diagnostics: Diagnostic[] = scanResult.diagnostics.map((d) => ({
    ...d,
    source: "apply" as const,
  }));

  filterPhantomResources(report, appliedAddresses);
  replaceKnownAfterApply(report);

  // Detect resources that were planned but never started (interrupted apply)
  const notStartedStatuses = buildNotStartedStatuses(
    plannedAddresses,
    appliedAddresses,
  );
  const allStatuses = [
    ...scanResult.applyStatuses,
    ...stateOnlyStatuses,
    ...notStartedStatuses,
  ];

  if (scanResult.outputsMessage) {
    resolveOutputValues(report, scanResult.outputsMessage);
  }

  const failedAddresses = new Set(
    scanResult.applyStatuses.filter((s) => !s.success).map((s) => s.address),
  );

  report.summary = buildApplySummary(report.resources ?? [], failedAddresses);

  if (diagnostics.length > 0) {
    report.diagnostics = diagnostics;
  }
  if (allStatuses.length > 0) {
    report.applyStatuses = allStatuses;
  }

  report.operation = "apply";

  // Tool version from scan (may override plan JSON detection)
  if (scanResult.tool !== undefined) {
    report.tool = scanResult.tool;
  }

  return report;
}

// ─── Plan-Based Extraction ──────────────────────────────────────────────────

/**
 * Extracts addresses of state-only operations from the plan JSON.
 *
 * State-only operations require no provider call and therefore emit no
 * `apply_complete`/`apply_errored` hooks in the apply JSONL. All three types
 * are reliably identifiable from the plan JSON alone:
 * - **Forget** (`actions: ["forget"]`): removes a resource from state without
 *   destroying the real infrastructure (via `removed { destroy = false }`).
 *   Emits a `planned_change action="remove"` in the JSONL but no apply hooks.
 * - **Move** (`actions: ["no-op"]` + `previous_address`): renames a resource
 *   in state; no provider call needed. No JSONL messages at all.
 * - **State-only import** (`actions: ["no-op"]` + `importing`): imports a
 *   resource that already matches the desired state; no update required.
 *   No JSONL messages at all.
 */
function extractStateOnlyAddresses(plan: Plan): Map<string, PlanAction> {
  const addresses = new Map<string, PlanAction>();
  for (const rc of plan.resource_changes ?? []) {
    if (rc.mode === "data") continue;
    const actions = rc.change.actions;
    if (actions.length !== 1) continue;
    const action = actions[0];
    if (action === "forget") {
      if (rc.address) addresses.set(rc.address, "forget");
    } else if (action === "no-op") {
      if (rc.previous_address) {
        if (rc.address) addresses.set(rc.address, "move");
      } else if (rc.change.importing) {
        if (rc.address) addresses.set(rc.address, "import");
      }
    }
  }
  return addresses;
}

/**
 * Builds successful ApplyStatus entries for state-only operations.
 * State-only operations (forget, move, state-only import) always succeed —
 * they are instantaneous state mutations with no provider call and no hooks.
 */
function buildStateOnlyStatuses(
  stateOnlyAddresses: Map<string, PlanAction>,
): ApplyStatus[] {
  return [...stateOnlyAddresses.entries()].map(([address, action]) => ({
    address,
    action,
    success: true,
  }));
}

/**
 * Builds ApplyStatus entries for resources that were planned but never
 * started. This happens when an apply is interrupted (timeout, crash,
 * cancellation) before all resources are processed.
 *
 * State-only operations (forget, move, state-only import) are never in this
 * list: their addresses are included in `appliedAddresses` via
 * `extractStateOnlyAddresses`, so `!appliedAddresses.has(addr)` is already
 * false for them. Move and import additionally never appear in
 * `plannedAddresses` since they emit no `planned_change` JSONL messages.
 */
function buildNotStartedStatuses(
  plannedAddresses: Map<string, PlanAction>,
  appliedAddresses: Set<string>,
): ApplyStatus[] {
  const notStarted: ApplyStatus[] = [];
  for (const [addr, action] of plannedAddresses) {
    // completedAddresses ⊆ appliedAddresses, so checking appliedAddresses
    // is sufficient — a resource cannot complete without being applied.
    if (!appliedAddresses.has(addr)) {
      notStarted.push({
        address: addr,
        action,
        success: false,
      });
    }
  }
  return notStarted;
}

// ─── Report Mutation Helpers ────────────────────────────────────────────────

/**
 * Removes resources from the report that were not actually applied.
 * A resource is a "phantom" if its address does not appear in the
 * applied addresses set.
 */
function filterPhantomResources(
  report: Report,
  appliedAddresses: Set<string>,
): void {
  if (!report.resources) return;
  report.resources = report.resources.filter((r) =>
    appliedAddresses.has(r.address),
  );
}

/**
 * Replaces `(known after apply)` sentinel values with `(value not in plan)`
 * throughout the report. In an apply report, the apply has already happened
 * so "(known after apply)" is misleading. The plan JSON doesn't contain the
 * resolved values, so we indicate they're not available.
 */
function replaceKnownAfterApply(report: Report): void {
  for (const resource of report.resources ?? []) {
    for (const attr of resource.attributes) {
      if (attr.isKnownAfterApply) {
        attr.after = VALUE_NOT_IN_PLAN;
      }
    }
  }

  for (const output of report.outputs ?? []) {
    if (output.isKnownAfterApply) {
      output.after = VALUE_NOT_IN_PLAN;
    }
  }
}

/**
 * Resolves output values from the apply JSONL `outputs` message.
 * For non-sensitive outputs, replaces sentinel values with the actual
 * resolved value. Sensitive outputs are never resolved (security invariant).
 */
function resolveOutputValues(
  report: Report,
  outputsMessage: UIOutputsMessage,
): void {
  for (const output of report.outputs ?? []) {
    const resolved = outputsMessage.outputs[output.name];
    if (!resolved) continue;

    // Security invariant: never read values of sensitive outputs
    if (output.isSensitive || resolved.sensitive) continue;

    if (output.isKnownAfterApply) {
      const val = resolved.value;
      if (val !== undefined && val !== null) {
        output.after =
          typeof val === "string" ? val : JSON.stringify(val, null, 2);
      }
    }
  }
}
