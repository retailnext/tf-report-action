/**
 * Process the show-plan step output and enrich the report.
 *
 * Parses plan JSON from `tofu show -json <planfile>`, builds a structured
 * report (plan or apply depending on whether apply step is present), and
 * merges the result into the progressive report.
 */

import type { BuildOptions } from "./options.js";
import type { RenderOptions } from "../model/render-options.js";
import type { StepData, ReaderOptions } from "../steps/types.js";
import type { Report, Tool } from "../model/report.js";
import { expectedCommand } from "../model/step-commands.js";
import { readStepStdout } from "../steps/io.js";
import { getStepOutcome } from "../steps/outcomes.js";
import { parsePlan, detectToolFromPlan } from "../parser/index.js";
import { buildReport } from "./index.js";
import { buildApplyReport } from "./apply.js";
import { buildStepIssue } from "./step-issues.js";
import { scanString } from "../jsonl-scanner/scan.js";

/**
 * Try to parse show-plan JSON and build a full structured report.
 * Returns true if successful, false if the output couldn't be parsed.
 *
 * When successful, enriches the report with modules, summary, outputs,
 * drift, and format metadata. If apply step is also available with JSONL,
 * uses buildApplyReport for combined plan+apply enrichment.
 */
export function tryProcessShowPlan(
  showPlanStep: StepData,
  showPlanStepId: string,
  applyStep: StepData | undefined,
  applyStepId: string,
  report: Report,
  readerOpts: ReaderOptions,
  options: (BuildOptions & RenderOptions) | undefined,
  tool: Tool | undefined,
): boolean {
  const read = readStepStdout(showPlanStep, readerOpts);
  if (read.content === undefined) {
    if (read.error) {
      report.warnings.push(`show-plan stdout: ${read.error}`);
    } else if (read.noFile) {
      report.warnings.push("show-plan: stdout_file output missing in steps");
    }
    return false;
  }

  let plan: ReturnType<typeof parsePlan>;
  try {
    plan = parsePlan(read.content);
  } catch (err: unknown) {
    const errorDetail = err instanceof Error ? err.message : "unknown error";
    const commandHint = expectedCommand(tool, "show-plan");
    report.issues.push(
      buildStepIssue(
        showPlanStep,
        showPlanStepId,
        readerOpts,
        `Plan output could not be parsed: ${errorDetail}. Expected output from \`${commandHint}\`.`,
      ),
    );
    return false;
  }

  // Try to build an apply report if apply step has JSONL
  let enrichedReport: Report;
  let isApplyMode = false;

  if (applyStep && getStepOutcome(applyStep) !== "skipped") {
    isApplyMode = true;
    const applyRead = readStepStdout(applyStep, readerOpts);
    if (applyRead.content !== undefined) {
      try {
        const applyScan = scanString(applyRead.content);
        enrichedReport = buildApplyReport(plan, applyScan, options);
      } catch {
        report.warnings.push(
          `Apply output from step \`${applyStepId}\` could not be parsed; using plan data only.`,
        );
        enrichedReport = buildReport(plan, options);
      }
    } else {
      enrichedReport = buildReport(plan, options);
    }
  } else {
    enrichedReport = buildReport(plan, options);
  }

  // Merge enriched report fields into the progressive report
  if (enrichedReport.summary !== undefined)
    report.summary = enrichedReport.summary;
  if (enrichedReport.resources !== undefined)
    report.resources = enrichedReport.resources;
  if (enrichedReport.driftResources !== undefined)
    report.driftResources = enrichedReport.driftResources;
  if (enrichedReport.outputs !== undefined)
    report.outputs = enrichedReport.outputs;
  const mergedDiags = [
    ...(report.diagnostics ?? []),
    ...(enrichedReport.diagnostics ?? []),
  ];
  if (mergedDiags.length > 0) report.diagnostics = mergedDiags;
  if (enrichedReport.applyStatuses !== undefined)
    report.applyStatuses = enrichedReport.applyStatuses;
  if (enrichedReport.formatVersion)
    report.formatVersion = enrichedReport.formatVersion;
  if (enrichedReport.toolVersion)
    report.toolVersion = enrichedReport.toolVersion;
  if (enrichedReport.timestamp) report.timestamp = enrichedReport.timestamp;
  report.operation = isApplyMode ? "apply" : "plan";

  // Tool detection from plan JSON
  const detectedTool = detectToolFromPlan(plan);
  if (detectedTool !== undefined) report.tool = detectedTool;

  return true;
}
