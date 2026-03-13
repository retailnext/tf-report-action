/**
 * Builds an apply report by enriching a plan-based Report with actual
 * apply outcomes from machine-readable UI log messages.
 *
 * The key operation is **phantom filtering**: resources that appear in the
 * plan but were not actually applied (no `apply_start`/`apply_errored`
 * message) are removed from the report. This ensures the apply report
 * only shows resources that were actually changed.
 */

import type { Plan } from "../tfjson/plan.js";
import type {
  UIMessage,
  UIApplyStartMessage,
  UIApplyCompleteMessage,
  UIApplyErroredMessage,
  UIDiagnosticMessage,
  UIOutputsMessage,
} from "../tfjson/machine-readable-ui.js";
import type { Report } from "../model/report.js";
import type { Diagnostic } from "../model/diagnostic.js";
import type { ApplyStatus } from "../model/apply-status.js";
import type { BuildOptions } from "./options.js";
import type { PlanAction } from "../model/plan-action.js";
import { buildReport } from "./index.js";
import { buildApplySummary } from "./summary.js";
import { KNOWN_AFTER_APPLY, VALUE_NOT_IN_PLAN } from "../model/sentinels.js";

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
): Report {
  const report = buildReport(plan, options);

  const appliedAddresses = extractAppliedAddresses(messages);
  const applyStatuses = extractApplyStatuses(messages);
  const diagnostics = extractDiagnostics(messages);
  const outputsMessage = findOutputsMessage(messages);

  filterPhantomResources(report, appliedAddresses);
  replaceKnownAfterApply(report);

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
  if (applyStatuses.length > 0) {
    report.applyStatuses = applyStatuses;
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
function filterPhantomResources(report: Report, appliedAddresses: Set<string>): void {
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
function replaceKnownAfterApply(report: Report): void {
  for (const group of report.modules) {
    for (const resource of group.resources) {
      for (const attr of resource.attributes) {
        if (attr.after === KNOWN_AFTER_APPLY) {
          attr.after = VALUE_NOT_IN_PLAN;
          attr.isKnownAfterApply = false;
        }
      }
    }
  }

  for (const output of report.outputs) {
    if (output.after === KNOWN_AFTER_APPLY) {
      output.after = VALUE_NOT_IN_PLAN;
    }
  }
}

/**
 * Resolves output values from the apply JSONL `outputs` message.
 * For non-sensitive outputs, replaces sentinel values with the actual
 * resolved value. Sensitive outputs are never resolved (security invariant).
 */
function resolveOutputValues(report: Report, outputsMessage: UIOutputsMessage): void {
  for (const output of report.outputs) {
    const resolved = outputsMessage.outputs[output.name];
    if (!resolved) continue;

    // Security invariant: never read values of sensitive outputs
    if (output.isSensitive || resolved.sensitive) continue;

    if (output.after === VALUE_NOT_IN_PLAN || output.after === KNOWN_AFTER_APPLY) {
      const val = resolved.value;
      if (val !== undefined && val !== null) {
        output.after = typeof val === "string"
          ? val
          : JSON.stringify(val, null, 2);
      }
    }
  }
}
