/**
 * Shared helpers for per-step report processors.
 *
 * This module exists so that individual process-* files remain dependency
 * leaves — they import from here (and from lower layers) but never from
 * each other.
 */

import type { Diagnostic } from "../model/diagnostic.js";
import type { UIDiagnostic } from "../tfjson/machine-readable-ui.js";
import type { ScanResult } from "../jsonl-scanner/types.js";
import type { Report } from "../model/report.js";
import type { StepRole } from "../model/step-commands.js";
import {
  UnparseableLinesWarning,
  UnknownMessageTypesWarning,
} from "./warnings.js";

/**
 * Convert a UIDiagnostic from validate/JSONL wire format to the model Diagnostic.
 */
export function uiDiagnosticToModel(
  d: UIDiagnostic,
  source: "validate" | "plan" | "apply",
): Diagnostic {
  const base: Record<string, unknown> = {
    severity: d.severity,
    summary: d.summary,
    detail: d.detail,
    source,
  };
  if (d.address !== undefined) base["address"] = d.address;
  if (d.range !== undefined) base["range"] = d.range;
  if (d.snippet !== undefined) base["snippet"] = d.snippet;
  return base as unknown as Diagnostic;
}

// ─── JSONL address filtering ────────────────────────────────────────────────

/**
 * Determine the resource address associated with a JSON Lines message, if any.
 *
 * Messages that carry a resource address:
 * - Hook-based apply messages (`apply_start`, `apply_progress`,
 *   `apply_complete`, `apply_errored`, `refresh_start`, `refresh_complete`,
 *   `provision_start`, `provision_progress`, `provision_complete`,
 *   `provision_errored`) — via `hook.resource.addr`
 * - `planned_change` / `resource_drift` — via `change.resource.addr`
 * - `diagnostic` — via `diagnostic.address` (optional; may be absent)
 *
 * Returns `undefined` for messages with no resource address (e.g. `version`,
 * `change_summary`, `outputs`), meaning the line should always be retained.
 */
function extractJsonlResourceAddress(
  obj: Record<string, unknown>,
): string | undefined {
  const type = obj["type"];
  if (typeof type !== "string") return undefined;

  // Messages with hook.resource.addr
  if (
    type === "apply_start" ||
    type === "apply_progress" ||
    type === "apply_complete" ||
    type === "apply_errored" ||
    type === "refresh_start" ||
    type === "refresh_complete" ||
    type === "provision_start" ||
    type === "provision_progress" ||
    type === "provision_complete" ||
    type === "provision_errored"
  ) {
    const hook = obj["hook"];
    if (typeof hook !== "object" || hook === null) return undefined;
    const resource = (hook as Record<string, unknown>)["resource"];
    if (typeof resource !== "object" || resource === null) return undefined;
    const addr = (resource as Record<string, unknown>)["addr"];
    return typeof addr === "string" ? addr : undefined;
  }

  // planned_change / resource_drift: change.resource.addr
  if (type === "planned_change" || type === "resource_drift") {
    const change = obj["change"];
    if (typeof change !== "object" || change === null) return undefined;
    const resource = (change as Record<string, unknown>)["resource"];
    if (typeof resource !== "object" || resource === null) return undefined;
    const addr = (resource as Record<string, unknown>)["addr"];
    return typeof addr === "string" ? addr : undefined;
  }

  // diagnostic: diagnostic.address (optional — may be absent)
  if (type === "diagnostic") {
    const diagnostic = obj["diagnostic"];
    if (typeof diagnostic !== "object" || diagnostic === null) return undefined;
    const addr = (diagnostic as Record<string, unknown>)["address"];
    return typeof addr === "string" ? addr : undefined;
  }

  // All other types (version, change_summary, outputs, log, …) — no address
  return undefined;
}

/**
 * Filter JSON Lines content to only lines whose resource address is in
 * `addresses`, plus lines that have no resource address at all.
 *
 * Non-JSON lines and messages without a resource address (e.g. `version`,
 * `change_summary`, `outputs`) are always retained. Lines associated with a
 * resource address that is NOT in `addresses` are dropped.
 *
 * Used to trim step stdout when all diagnostics are resource-specific, so
 * the rendered output only shows log entries relevant to the failing resources.
 */
export function filterJsonlByAddresses(
  content: string,
  addresses: ReadonlySet<string>,
): string {
  const lines = content.split("\n");
  const filtered: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      filtered.push(line);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      filtered.push(line); // Non-JSON — include as-is
      continue;
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      filtered.push(line); // Not a JSON object — include as-is
      continue;
    }

    const addr = extractJsonlResourceAddress(parsed as Record<string, unknown>);
    if (addr === undefined || addresses.has(addr)) {
      filtered.push(line);
    }
    // else: skip — this line is for a resource not in the failed/warned set
  }

  return filtered.join("\n");
}

/**
 * When all of `diagnostics` have a resource `address`, replace the
 * `StepIssue` identified by `stepId` in `report.issues` with a version
 * whose stdout is filtered to only the JSONL lines associated with those
 * addresses (plus un-addressed lines like `version` and `change_summary`).
 *
 * A no-op when:
 * - `diagnostics` is empty
 * - any diagnostic lacks an `address` (filtering would be incomplete)
 * - no issue with `stepId` exists in `report.issues`
 * - the matching issue has no stdout
 */
export function filterStepIssueStdout(
  report: Report,
  stepId: string,
  diagnostics: readonly Diagnostic[],
): void {
  const addresses = new Set<string>();
  for (const d of diagnostics) {
    if (d.address === undefined) return;
    addresses.add(d.address);
  }
  if (addresses.size === 0) return;
  const idx = report.issues.findIndex((i) => i.id === stepId);
  if (idx < 0) return;

  const issue = report.issues[idx];
  // istanbul ignore next — findIndex guarantees idx is in range
  if (issue === undefined) return;
  if (issue.stdout === undefined) return;

  const filtered = filterJsonlByAddresses(issue.stdout, addresses);
  report.issues[idx] = { ...issue, stdout: filtered };
}

/** Add scanner quality warnings to the report. */
export function addScannerWarnings(
  report: Report,
  scan: ScanResult,
  role: StepRole,
): void {
  if (scan.unparseableLines > 0) {
    report.warnings.push(
      new UnparseableLinesWarning(scan.unparseableLines, role),
    );
  }
  if (scan.unknownTypeLines > 0) {
    report.warnings.push(
      new UnknownMessageTypesWarning(scan.unknownTypeLines, role),
    );
  }
}
