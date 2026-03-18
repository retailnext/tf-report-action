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

/** Add scanner quality warnings to the report. */
export function addScannerWarnings(
  report: Report,
  scan: ScanResult,
  stepLabel: string,
): void {
  if (scan.unparseableLines > 0) {
    report.warnings.push(
      `${String(scan.unparseableLines)} line(s) in ${stepLabel} output could not be parsed as JSON`,
    );
  }
  if (scan.unknownTypeLines > 0) {
    report.warnings.push(
      `${String(scan.unknownTypeLines)} line(s) in ${stepLabel} output had unrecognized message types`,
    );
  }
}
