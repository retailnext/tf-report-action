/**
 * Builds an apply report by enriching a plan-based Report with actual
 * apply outcomes from machine-readable UI log messages.
 *
 * The key operation is **phantom filtering**: resources that appear in the
 * plan but were not actually applied are removed from the report. Resources
 * that were actually changed fall into two categories:
 * - Hook-based: emitted `apply_start`/`apply_errored` messages (creates,
 *   updates, deletes, replaces).
 * - State-only: no provider call and therefore no apply hooks (forgets, moves,
 *   and state-only imports). These are identified from the plan JSON.
 */

import type { Plan } from "../tfjson/plan.js";
import type {
  UIMessage,
  UIApplyStartMessage,
  UIApplyCompleteMessage,
  UIApplyErroredMessage,
  UIDiagnosticMessage,
  UIOutputsMessage,
  UIPlannedChangeMessage,
} from "../tfjson/machine-readable-ui.js";
import type { StructuredReport } from "../model/report.js";
import type { Diagnostic } from "../model/diagnostic.js";
import type { ApplyStatus } from "../model/apply-status.js";
import type { BuildOptions } from "./options.js";
import type { PlanAction } from "../model/plan-action.js";
import { buildReport } from "./index.js";
import { buildApplySummary } from "./summary.js";
import { VALUE_NOT_IN_PLAN } from "../model/sentinels.js";

// ─── Type Guards ────────────────────────────────────────────────────────────

function isApplyStart(msg: UIMessage): msg is UIApplyStartMessage {
  return msg.type === "apply_start";
}

function isApplyComplete(msg: UIMessage): msg is UIApplyCompleteMessage {
  return msg.type === "apply_complete";
}

function isApplyErrored(msg: UIMessage): msg is UIApplyErroredMessage {
  return msg.type === "apply_errored";
}

function isDiagnostic(msg: UIMessage): msg is UIDiagnosticMessage {
  return msg.type === "diagnostic";
}

function isOutputs(msg: UIMessage): msg is UIOutputsMessage {
  return msg.type === "outputs";
}

function isPlannedChange(msg: UIMessage): msg is UIPlannedChangeMessage {
  return msg.type === "planned_change";
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Builds a Report enriched with apply outcomes. Starts from a plan-based
 * report and filters/augments it using the apply UI log messages.
 *
 * @param plan    - Parsed plan JSON (from `show -json`)
 * @param messages - Parsed UI log messages (from apply `-json`)
 * @param options  - Build options (same as for plan reports)
 */
export function buildApplyReport(
  plan: Plan,
  messages: UIMessage[],
  options: BuildOptions = {},
): StructuredReport {
  const report = buildReport(plan, options);

  const stateOnlyAddresses = extractStateOnlyAddresses(plan);
  const appliedAddresses = new Set([
    ...extractAppliedAddresses(messages),
    ...stateOnlyAddresses.keys(),
  ]);
  const plannedAddresses = extractPlannedAddresses(messages);
  const applyStatuses = extractApplyStatuses(messages);
  const stateOnlyStatuses = buildStateOnlyStatuses(stateOnlyAddresses);
  const diagnostics = extractDiagnostics(messages);
  const outputsMessage = findOutputsMessage(messages);

  filterPhantomResources(report, appliedAddresses);
  replaceKnownAfterApply(report);

  // Detect resources that were planned but never started (interrupted apply)
  const notStartedStatuses = buildNotStartedStatuses(plannedAddresses, appliedAddresses, messages);
  const allStatuses = [...applyStatuses, ...stateOnlyStatuses, ...notStartedStatuses];

  if (outputsMessage) {
    resolveOutputValues(report, outputsMessage);
  }

  const failedAddresses = new Set(
    applyStatuses.filter((s) => !s.success).map((s) => s.address),
  );

  report.summary = buildApplySummary(
    report.modules.flatMap((m) => m.resources),
    failedAddresses,
  );

  if (diagnostics.length > 0) {
    report.diagnostics = diagnostics;
  }
  if (allStatuses.length > 0) {
    report.applyStatuses = allStatuses;
  }

  return report;
}

// ─── Extraction Helpers ─────────────────────────────────────────────────────

/**
 * Collects the set of resource addresses that were actually applied.
 * A resource appears in this set if it has an `apply_start` or `apply_errored`
 * message — even failed resources were attempted and should appear in the report.
 */
function extractAppliedAddresses(messages: UIMessage[]): Set<string> {
  const addresses = new Set<string>();
  for (const msg of messages) {
    if (isApplyStart(msg) || isApplyErrored(msg)) {
      addresses.add(msg.hook.resource.addr);
    }
  }
  return addresses;
}

/**
 * Extracts addresses of state-only operations from the plan JSON.
 *
 * State-only operations require no provider call and therefore emit no
 * `apply_start`/`apply_complete` hooks in the apply JSONL. All three types
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
function buildStateOnlyStatuses(stateOnlyAddresses: Map<string, PlanAction>): ApplyStatus[] {
  return [...stateOnlyAddresses.entries()].map(([address, action]) => ({
    address,
    action,
    success: true,
  }));
}

/**
 * Collects the set of resource addresses that had a `planned_change` message.
 * These represent all resources the apply was supposed to process.
 */
function extractPlannedAddresses(messages: UIMessage[]): Map<string, PlanAction> {
  const planned = new Map<string, PlanAction>();
  for (const msg of messages) {
    if (isPlannedChange(msg)) {
      planned.set(msg.change.resource.addr, uiActionToPlanAction(msg.change.action));
    }
  }
  return planned;
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
  messages: UIMessage[],
): ApplyStatus[] {
  // Also check apply_complete addresses (some resources may have completed
  // without being in the applied set due to edge cases)
  const completedAddresses = new Set<string>();
  for (const msg of messages) {
    if (isApplyComplete(msg)) {
      completedAddresses.add(msg.hook.resource.addr);
    }
  }

  const notStarted: ApplyStatus[] = [];
  for (const [addr, action] of plannedAddresses) {
    if (!appliedAddresses.has(addr) && !completedAddresses.has(addr)) {
      notStarted.push({
        address: addr,
        action,
        success: false,
      });
    }
  }
  return notStarted;
}

/** Maps a UI change action string to the model's PlanAction. */
function uiActionToPlanAction(action: string): PlanAction {
  switch (action) {
    case "create":
      return "create";
    case "update":
      return "update";
    case "delete":
      return "delete";
    case "replace":
      return "replace";
    case "read":
      return "read";
    case "noop":
      return "no-op";
    case "forget":
      return "forget";
    // In the UI JSONL, forget operations are emitted as "remove" in planned_change
    // messages (distinct from "delete" which is used for actual destroys). The
    // change_summary then counts them under "forget". Map both to "forget".
    case "remove":
      return "forget";
    default:
      return "unknown";
  }
}

/**
 * Builds ApplyStatus entries from apply hook messages. For resources that have
 * multiple start/complete cycles (e.g. replace = delete + create), the last
 * outcome for each address is used.
 */
function extractApplyStatuses(messages: UIMessage[]): ApplyStatus[] {
  const statusMap = new Map<string, ApplyStatus>();

  for (const msg of messages) {
    if (isApplyComplete(msg)) {
      const status: ApplyStatus = {
        address: msg.hook.resource.addr,
        action: uiActionToPlanAction(msg.hook.action),
        success: true,
        elapsed: msg.hook.elapsed_seconds,
        ...(msg.hook.id_key !== undefined ? { idKey: msg.hook.id_key } : {}),
        ...(msg.hook.id_value !== undefined ? { idValue: msg.hook.id_value } : {}),
      };
      statusMap.set(msg.hook.resource.addr, status);
    } else if (isApplyErrored(msg)) {
      statusMap.set(msg.hook.resource.addr, {
        address: msg.hook.resource.addr,
        action: uiActionToPlanAction(msg.hook.action),
        success: false,
        elapsed: msg.hook.elapsed_seconds,
      });
    }
  }

  return [...statusMap.values()];
}

/** Extracts diagnostics (errors and warnings) from UI messages. */
function extractDiagnostics(messages: UIMessage[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const msg of messages) {
    if (isDiagnostic(msg)) {
      const diag: Diagnostic = {
        severity: msg.diagnostic.severity,
        summary: msg.diagnostic.summary,
        detail: msg.diagnostic.detail,
        ...(msg.diagnostic.address !== undefined ? { address: msg.diagnostic.address } : {}),
      };
      diagnostics.push(diag);
    }
  }
  return diagnostics;
}

/** Finds the last `outputs` message in the log (there should be at most one). */
function findOutputsMessage(messages: UIMessage[]): UIOutputsMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && isOutputs(msg)) {
      return msg;
    }
  }
  return undefined;
}

// ─── Report Mutation Helpers ────────────────────────────────────────────────

/**
 * Removes resources from the report that were not actually applied.
 * A resource is a "phantom" if its address does not appear in the
 * applied addresses set. Empty module groups are also removed.
 */
function filterPhantomResources(report: StructuredReport, appliedAddresses: Set<string>): void {
  for (const group of report.modules) {
    group.resources = group.resources.filter(
      (r) => appliedAddresses.has(r.address),
    );
  }
  report.modules = report.modules.filter((m) => m.resources.length > 0);
}

/**
 * Replaces `(known after apply)` sentinel values with `(value not in plan)`
 * throughout the report. In an apply report, the apply has already happened
 * so "(known after apply)" is misleading. The plan JSON doesn't contain the
 * resolved values, so we indicate they're not available.
 */
function replaceKnownAfterApply(report: StructuredReport): void {
  for (const group of report.modules) {
    for (const resource of group.resources) {
      for (const attr of resource.attributes) {
        if (attr.isKnownAfterApply) {
          attr.after = VALUE_NOT_IN_PLAN;
        }
      }
    }
  }

  for (const output of report.outputs) {
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
function resolveOutputValues(report: StructuredReport, outputsMessage: UIOutputsMessage): void {
  for (const output of report.outputs) {
    const resolved = outputsMessage.outputs[output.name];
    if (!resolved) continue;

    // Security invariant: never read values of sensitive outputs
    if (output.isSensitive || resolved.sensitive) continue;

    if (output.isKnownAfterApply) {
      const val = resolved.value;
      if (val !== undefined && val !== null) {
        output.after = typeof val === "string"
          ? val
          : JSON.stringify(val, null, 2);
      }
    }
  }
}
