/**
 * Process the apply step output and enrich the report.
 *
 * Scans apply step JSONL for apply statuses, diagnostics, and resources,
 * or falls back to raw text display when JSONL is not available.
 */

import type { StepData, ReaderOptions } from "../steps/types.js";
import type { Report } from "../model/report.js";
import type { Diagnostic } from "../model/diagnostic.js";
import type { ScanResult } from "../jsonl-scanner/types.js";
import { getStepOutcome } from "../steps/outcomes.js";
import {
  readStepStdout,
  readStepStdoutForDisplay,
  getStepStdoutPath,
} from "../steps/io.js";
import { detectToolFromOutput } from "../parser/index.js";
import { scanFile } from "../jsonl-scanner/scan.js";
import { isJsonLines } from "../jsonl-scanner/detect.js";
import { buildStepIssue } from "./step-issues.js";
import { buildSummaryFromScan } from "./summary.js";
import { buildResourcesFromScan } from "./resources.js";
import { addScannerWarnings } from "./process-helpers.js";

/**
 * Process the apply step: scan JSONL for apply statuses and diagnostics,
 * or fall back to raw text display.
 */
export function processApplyStep(
  step: StepData,
  stepId: string,
  report: Report,
  readerOpts: ReaderOptions,
  showPlanParsed: boolean,
): void {
  const outcome = getStepOutcome(step);

  // Create StepIssue for failed apply step
  if (outcome === "failure") {
    report.issues.push(buildStepIssue(step, stepId, readerOpts));
  }

  const path = getStepStdoutPath(step, readerOpts);
  if (path) {
    const peek = readStepStdoutForDisplay(step, readerOpts);
    if (peek.content !== undefined) {
      const firstLines = peek.content.split("\n", 10);
      if (isJsonLines(firstLines)) {
        enrichFromApplyJsonl(path, report, readerOpts, showPlanParsed);
        return;
      }
    }
  }

  // Plaintext or unreadable: show as raw content
  if (outcome !== "failure") {
    const read = readStepStdout(step, readerOpts);
    if (read.content !== undefined) {
      const detectedTool = detectToolFromOutput(read.content);
      if (detectedTool !== undefined) report.tool = detectedTool;

      report.rawStdout.push({
        stepId,
        label: "Apply Output",
        content: read.content,
        truncated: read.truncated === true,
      });
    } else if (read.error) {
      report.warnings.push(`apply stdout: ${read.error}`);
    } else if (read.noFile) {
      report.warnings.push("apply: stdout_file output missing in steps");
    }
  }

  // Mark as apply operation regardless of output format
  report.operation = "apply";
}

/**
 * Enrich the report from apply JSONL.
 */
function enrichFromApplyJsonl(
  filePath: string,
  report: Report,
  readerOpts: ReaderOptions,
  showPlanParsed: boolean,
): void {
  let scan: ScanResult;
  try {
    scan = scanFile(filePath, readerOpts.maxFileSize);
  } catch {
    report.warnings.push("Apply JSONL file could not be scanned");
    return;
  }

  // Tool detection
  if (scan.tool !== undefined) report.tool = scan.tool;

  // Apply statuses
  if (scan.applyStatuses.length > 0) {
    report.applyStatuses = [
      ...(report.applyStatuses ?? []),
      ...scan.applyStatuses,
    ];
  }

  // Diagnostics from apply
  if (scan.diagnostics.length > 0) {
    const applyDiags: Diagnostic[] = scan.diagnostics.map((d) => ({
      ...d,
      source: "apply" as const,
    }));
    report.diagnostics = [...(report.diagnostics ?? []), ...applyDiags];
  }

  // If no show-plan and no plan JSONL provided resources, apply JSONL can fill in
  if (
    !showPlanParsed &&
    report.resources === undefined &&
    scan.plannedChanges.length > 0
  ) {
    report.summary = buildSummaryFromScan(scan.plannedChanges);
    report.resources = buildResourcesFromScan(scan.plannedChanges);
  }

  // Drift from apply JSONL (supplement plan data)
  if (scan.driftChanges.length > 0 && report.driftResources === undefined) {
    report.driftResources = buildResourcesFromScan(scan.driftChanges);
  }

  // Operation detection from change_summary
  if (scan.changeSummary !== undefined) {
    const op = scan.changeSummary.operation;
    if (op === "apply" || op === "destroy") {
      report.operation = op;
    }
  }
  // Apply step always overrides to apply (even without change_summary)
  if (report.operation === undefined || report.operation === "plan") {
    report.operation = "apply";
  }

  // Scanner quality warnings
  addScannerWarnings(report, scan, "apply");
}
