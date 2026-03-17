/**
 * Process the plan step output and enrich the report.
 *
 * Scans plan step JSONL for structured data (resources, diagnostics, drift)
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
 * Process the plan step: scan JSONL for structured data, or fall back
 * to raw text display.
 */
export function processPlanStep(
  step: StepData,
  stepId: string,
  report: Report,
  readerOpts: ReaderOptions,
  showPlanParsed: boolean,
): void {
  const outcome = getStepOutcome(step);

  // Create StepIssue for failed plan step
  if (outcome === "failure") {
    report.issues.push(buildStepIssue(step, stepId, readerOpts));
  }

  // If show-plan was parsed, plan JSONL provides only supplemental data
  // (diagnostics are the main addition since show-plan JSON lacks source ranges).
  // If show-plan was NOT parsed, plan JSONL is our primary structured data source.

  const path = getStepStdoutPath(step, readerOpts);
  if (path) {
    // Check first lines for JSONL detection
    const peek = readStepStdoutForDisplay(step, readerOpts);
    if (peek.content !== undefined) {
      const firstLines = peek.content.split("\n", 10);
      if (isJsonLines(firstLines)) {
        enrichFromPlanJsonl(path, report, readerOpts, showPlanParsed);
        return;
      }
    }
  }

  // Plaintext or unreadable: show as raw content
  if (outcome !== "failure") {
    // Don't show raw for failed steps — the StepIssue already has stdout
    const read = readStepStdout(step, readerOpts);
    if (read.content !== undefined) {
      // Try tool detection from raw output
      const detectedTool = detectToolFromOutput(read.content);
      if (detectedTool !== undefined) report.tool = detectedTool;

      report.rawStdout.push({
        stepId,
        label: "Plan Output",
        content: read.content,
        truncated: read.truncated === true,
      });
    } else if (read.error) {
      report.warnings.push(`plan stdout: ${read.error}`);
    } else if (read.noFile) {
      report.warnings.push("plan: stdout_file output missing in steps");
    }
  }
}

/**
 * Enrich the report from plan JSONL (Tier 2 path).
 */
function enrichFromPlanJsonl(
  filePath: string,
  report: Report,
  readerOpts: ReaderOptions,
  showPlanParsed: boolean,
): void {
  let scan: ScanResult;
  try {
    scan = scanFile(filePath, readerOpts.maxFileSize);
  } catch {
    report.warnings.push("Plan JSONL file could not be scanned");
    return;
  }

  // Tool detection from scan
  if (scan.tool !== undefined) report.tool = scan.tool;

  // Diagnostics (always add — plan JSONL has source ranges even when show-plan is available)
  if (scan.diagnostics.length > 0) {
    const planDiags: Diagnostic[] = scan.diagnostics.map((d) => ({
      ...d,
      source: "plan" as const,
    }));
    report.diagnostics = [...(report.diagnostics ?? []), ...planDiags];
  }

  // If show-plan was already parsed, it has richer data — skip summary/modules
  if (showPlanParsed) return;

  // Tier 2: build summary and resources from JSONL
  if (scan.plannedChanges.length > 0) {
    report.summary = buildSummaryFromScan(scan.plannedChanges);
    report.resources = buildResourcesFromScan(scan.plannedChanges);
  }

  // Drift
  if (scan.driftChanges.length > 0) {
    report.driftResources = buildResourcesFromScan(scan.driftChanges);
  }

  // Operation
  if (scan.changeSummary !== undefined) {
    const op = scan.changeSummary.operation;
    if (op === "apply" || op === "destroy") {
      report.operation = op;
    } else {
      report.operation = "plan";
    }
  }

  // Scanner quality warnings
  addScannerWarnings(report, scan, "plan");
}
