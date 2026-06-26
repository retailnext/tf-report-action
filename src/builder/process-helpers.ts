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
import type { StepData, ReaderOptions } from "../steps/types.js";
import type { StepIssue } from "../model/step-issue.js";
import type { StepRole } from "../model/step-commands.js";
import { scanFile } from "../jsonl-scanner/scan.js";
import { buildStepIssue } from "./step-issues.js";
import { RelevanceEmitter, type ConcernSeed } from "./causal-relevance.js";
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

// ─── Failure-focused step issue ─────────────────────────────────────────────

/**
 * Build the StepIssue for a failed `plan`/`apply` step whose stdout is JSONL,
 * focusing the stdout to only the lines causally relevant to the failure.
 *
 * The `seed` is collected during the model-building scan (no extra read). When
 * the step has a concern (an error/warning diagnostic or an errored hook), a
 * second streaming scan emits only the relevant raw lines into the issue's
 * stdout — the full (potentially hundreds of MB) JSONL is never materialized.
 *
 * When the step failed but produced no concern (pathological — e.g. plain-text
 * stderr, unparseable output), there is nothing to scope to, so the issue keeps
 * its full bounded stdout (existing behavior).
 */
export function buildFocusedStepIssue(
  step: StepData,
  stepId: string,
  readerOpts: ReaderOptions,
  filePath: string,
  seed: ConcernSeed,
): StepIssue {
  if (!seed.hasConcern) {
    return buildStepIssue(step, stepId, readerOpts);
  }

  const issue = buildStepIssue(step, stepId, readerOpts, undefined, {
    skipStdout: true,
  });

  const emitter = new RelevanceEmitter(seed);
  try {
    scanFile(filePath, readerOpts.maxFileSize, emitter.visit);
  } catch {
    // Scan failed on the second pass — the issue still describes the failure;
    // omit stdout rather than attaching unfocused content.
    return issue;
  }
  return { ...issue, stdout: emitter.output() };
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
