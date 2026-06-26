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
import { filterJsonlByConcernRelevance } from "./causal-relevance.js";
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

// ─── Failed-step stdout focusing ────────────────────────────────────────────

/**
 * Replace the `StepIssue` identified by `stepId` in `report.issues` with a
 * version whose stdout is filtered to only the JSONL lines causally relevant
 * to the failure's concerns (error/warning diagnostics and errored hooks).
 *
 * Delegates the relevance decision to `filterJsonlByConcernRelevance`, which
 * self-derives the concern seed from the raw stdout. A no-op when no issue with
 * `stepId` exists, the matching issue has no stdout, or filtering changes
 * nothing (e.g. the step failed without emitting any concern).
 */
export function focusStepIssueStdout(report: Report, stepId: string): void {
  const idx = report.issues.findIndex((i) => i.id === stepId);
  if (idx < 0) return;

  const issue = report.issues[idx];
  // istanbul ignore next — findIndex guarantees idx is in range
  if (issue === undefined) return;
  if (issue.stdout === undefined) return;

  const filtered = filterJsonlByConcernRelevance(issue.stdout);
  if (filtered === issue.stdout) return;
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
