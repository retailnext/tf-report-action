/**
 * Builds a Report from parsed GitHub Actions steps context.
 *
 * This is the "build" step for the reportFromSteps pipeline.
 * It orchestrates: parse steps → build outcomes → detect tier → process
 * each step → progressive enrichment → title.
 *
 * The builder follows **progressive enrichment**: each step independently
 * contributes structured data (when parseable) or raw text (when not).
 * The Report accumulates fields from all available sources. When multiple
 * sources provide overlapping data, the richer source wins (show-plan JSON
 * provides attribute detail; JSONL provides summary, diagnostics, drift).
 */

import type { BuildOptions } from "./options.js";
import type { RenderOptions } from "../renderer/options.js";
import type { Env } from "../env/index.js";
import type { StepData, ReaderOptions } from "../steps/types.js";
import type { Report, Tool } from "../model/report.js";
import type { Diagnostic } from "../model/diagnostic.js";
import type { UIDiagnostic } from "../tfjson/machine-readable-ui.js";
import type { ScanResult } from "../jsonl-scanner/types.js";
import { expectedCommand } from "../model/step-commands.js";
import { parseSteps } from "../steps/parse.js";
import {
  DEFAULT_INIT_STEP,
  DEFAULT_VALIDATE_STEP,
  DEFAULT_PLAN_STEP,
  DEFAULT_SHOW_PLAN_STEP,
  DEFAULT_APPLY_STEP,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_DISPLAY_READ,
} from "../steps/types.js";
import {
  readStepStdout,
  readStepStdoutForDisplay,
  getStepStdoutPath,
} from "../steps/io.js";
import { getStepOutcome, buildStepOutcomes } from "../steps/outcomes.js";
import {
  parsePlan,
  detectToolFromPlan,
  detectToolFromOutput,
  parseValidateOutput,
} from "../parser/index.js";
import { buildReport } from "./index.js";
import { buildApplyReport } from "./apply.js";
import { buildSummaryFromScan } from "./summary.js";
import { buildResourcesFromScan } from "./resources.js";
import { scanString, scanFile } from "../jsonl-scanner/scan.js";
import { isJsonLines } from "../jsonl-scanner/detect.js";
import { buildStepIssue } from "./step-issues.js";
import { buildTitle } from "./title.js";
import { tmpdir } from "node:os";

/**
 * Options for `reportFromSteps()`. Extends the standard build/render options
 * with steps-specific configuration.
 */
export interface ReportOptions extends BuildOptions, RenderOptions {
  /** Directories from which stdout/stderr files may be read. Defaults to RUNNER_TEMP or OS temp. */
  allowedDirs?: readonly string[];
  /** Maximum total output length in characters. Default: 63 * 1024 */
  maxOutputLength?: number;
  /** Workspace name — used in the title and dedup marker. */
  workspace?: string;
  /** Environment variables (defaults to process.env). Injected for testability. */
  env?: Env;
  /**
   * IaC tool CLI command name for error messages.
   *
   * Auto-detected from available step outputs when not provided. Set this
   * to override auto-detection.
   */
  tool?: Tool;
  /** Step ID for the init step. Default: "init" */
  initStep?: string;
  /** Step ID for the validate step. Default: "validate" */
  validateStep?: string;
  /** Step ID for the plan step. Default: "plan" */
  planStep?: string;
  /** Step ID for the show-plan step. Default: "show-plan" */
  showPlanStep?: string;
  /** Step ID for the apply step. Default: "apply" */
  applyStep?: string;
}

/** Create an empty Report with required fields initialized. */
function createEmptyReport(): Report {
  return {
    title: "",
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: [],
  };
}

/**
 * Build a Report from a steps context JSON string.
 *
 * Returns a progressively-enriched Report with fields populated based on
 * available data. The renderer checks field presence to decide what to show.
 *
 * Processing follows these phases:
 * 1. Parse steps JSON and build step outcomes (with exit codes)
 * 2. Process each recognized step (init, validate, plan, show-plan, apply)
 * 3. Collect issues from failed/warning unfamiliar steps
 * 4. Detect all-steps-skipped scenario
 * 5. Generate title from available data
 */
export function buildReportFromSteps(
  stepsJson: string,
  options?: ReportOptions,
): Report {
  const env = options?.env ?? (process.env as Env);
  const workspace = options?.workspace;
  const logsUrl = buildLogsUrl(env);

  // Step IDs
  const initStepId = options?.initStep ?? DEFAULT_INIT_STEP;
  const validateStepId = options?.validateStep ?? DEFAULT_VALIDATE_STEP;
  const planStepId = options?.planStep ?? DEFAULT_PLAN_STEP;
  const showPlanStepId = options?.showPlanStep ?? DEFAULT_SHOW_PLAN_STEP;
  const applyStepId = options?.applyStep ?? DEFAULT_APPLY_STEP;
  const knownStepIds = new Set([
    initStepId,
    validateStepId,
    planStepId,
    showPlanStepId,
    applyStepId,
  ]);

  // Reader options
  const readerOpts: ReaderOptions = {
    allowedDirs: options?.allowedDirs ?? [env["RUNNER_TEMP"] ?? tmpdir()],
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
    maxDisplayRead: DEFAULT_MAX_DISPLAY_READ,
  };

  // Parse steps JSON
  const parseResult = parseSteps(stepsJson);
  if (typeof parseResult === "string") {
    return buildErrorReport(parseResult, workspace);
  }

  const steps = parseResult;
  const report = createEmptyReport();

  // Build step outcomes for ALL steps (with exit codes)
  report.steps = buildStepOutcomes(steps);
  if (workspace !== undefined) report.workspace = workspace;
  if (logsUrl !== undefined) report.logsUrl = logsUrl;

  // Tool name — explicit override or auto-detected from step outputs
  let tool: Tool | undefined = options?.tool;

  // Detect which IaC steps are present
  const initStep = steps[initStepId];
  const validateStep = steps[validateStepId];
  const planStep = steps[planStepId];
  const showPlanStep = steps[showPlanStepId];
  const applyStep = steps[applyStepId];
  const hasAnyIaCStep =
    initStep !== undefined ||
    validateStep !== undefined ||
    planStep !== undefined ||
    showPlanStep !== undefined ||
    applyStep !== undefined;

  // ─── Phase 1: Process init/validate (issue collection) ──────────────
  if (initStep && getStepOutcome(initStep) === "failure") {
    report.issues.push(buildStepIssue(initStep, initStepId, readerOpts));
  }

  if (validateStep) {
    processValidateStep(validateStep, validateStepId, report, readerOpts);
  }

  // ─── Phase 2: Process show-plan → plan → apply (progressive enrichment) ──
  let showPlanParsed = false;

  // Tier 1: show-plan JSON
  if (showPlanStep && getStepOutcome(showPlanStep) === "success") {
    showPlanParsed = tryProcessShowPlan(
      showPlanStep,
      showPlanStepId,
      applyStep,
      applyStepId,
      report,
      readerOpts,
      options,
      tool,
    );
    if (showPlanParsed) {
      tool ??= report.tool;
    }
  }

  // Tier 2/3: plan JSONL or raw text
  if (planStep) {
    processPlanStep(planStep, planStepId, report, readerOpts, showPlanParsed);
    tool ??= report.tool;
  }

  // Apply step: JSONL or raw text
  if (applyStep && getStepOutcome(applyStep) !== "skipped") {
    processApplyStep(
      applyStep,
      applyStepId,
      report,
      readerOpts,
      showPlanParsed,
    );
    tool ??= report.tool;
  }

  // ─── Phase 3: Unfamiliar step issues ──────────────────────────────
  for (const [stepId, step] of Object.entries(steps)) {
    if (knownStepIds.has(stepId)) continue;
    if (getStepOutcome(step) === "failure") {
      report.issues.push(buildStepIssue(step, stepId, readerOpts));
    }
  }

  // ─── Phase 4: Add warnings for limited data ──────────────────────
  if (
    !showPlanParsed &&
    (report.resources !== undefined || report.summary !== undefined)
  ) {
    // JSONL-enriched report — has structure but no attribute detail
    report.warnings.push(
      `This report was generated without \`${expectedCommand(tool, "show-plan")}\` output. Resource attribute details are not available.`,
    );
  } else if (!showPlanParsed && report.rawStdout.length > 0) {
    // Raw text fallback — no structured data at all
    report.warnings.push(
      `Report limited because \`${expectedCommand(tool, "show-plan")}\` output was not available. Showing raw command output.`,
    );
  }

  // Store detected tool
  if (tool !== undefined) report.tool = tool;

  // ─── Phase 5: Detect operation if not already set ──────────────────
  if (report.operation === undefined) {
    if (applyStep && getStepOutcome(applyStep) !== "skipped") {
      report.operation = "apply";
    } else if (planStep || showPlanStep) {
      report.operation = "plan";
    }
  }

  // ─── Phase 6: Generate title ───────────────────────────────────────
  report.title = buildTitle(report);

  // ─── Phase 7: Filter step table for IaC reports ────────────────────
  // When IaC content is present, show only IaC steps + failed unfamiliar
  if (hasAnyIaCStep) {
    const failedUnfamiliar = new Set(
      report.issues
        .filter((i) => !knownStepIds.has(i.id) && i.isFailed)
        .map((i) => i.id),
    );
    report.steps = report.steps.filter(
      (s) => knownStepIds.has(s.id) || failedUnfamiliar.has(s.id),
    );
  }

  return report;
}

// ─── Validate Step Processing ─────────────────────────────────────────────

/**
 * Process the validate step: extract diagnostics from JSON output, or
 * create a StepIssue if the step failed.
 */
function processValidateStep(
  step: StepData,
  stepId: string,
  report: Report,
  readerOpts: ReaderOptions,
): void {
  const outcome = getStepOutcome(step);

  if (outcome === "failure") {
    report.issues.push(buildStepIssue(step, stepId, readerOpts));
  }

  // Try to parse validate JSON output for diagnostics
  const stdoutRead = readStepStdout(step, readerOpts);
  if (stdoutRead.content !== undefined) {
    try {
      const validateOutput = parseValidateOutput(stdoutRead.content);
      if (validateOutput.diagnostics.length > 0) {
        const diagnostics = validateOutput.diagnostics.map((d: UIDiagnostic) =>
          uiDiagnosticToModel(d, "validate"),
        );
        report.diagnostics = [...(report.diagnostics ?? []), ...diagnostics];
      }
    } catch {
      // Not parseable as validate JSON — not an error, just no diagnostics
    }
  }
}

// ─── Show-Plan Processing ─────────────────────────────────────────────────

/**
 * Try to parse show-plan JSON and build a full structured report.
 * Returns true if successful, false if the output couldn't be parsed.
 *
 * When successful, enriches the report with modules, summary, outputs,
 * drift, and format metadata. If apply step is also available with JSONL,
 * uses buildApplyReport for combined plan+apply enrichment.
 */
function tryProcessShowPlan(
  showPlanStep: StepData,
  showPlanStepId: string,
  applyStep: StepData | undefined,
  applyStepId: string,
  report: Report,
  readerOpts: ReaderOptions,
  options: ReportOptions | undefined,
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
    const applyRead = readStepStdout(applyStep, readerOpts);
    if (applyRead.content !== undefined) {
      try {
        const applyScan = scanString(applyRead.content);
        enrichedReport = buildApplyReport(plan, applyScan, options);
        isApplyMode = true;
      } catch {
        enrichedReport = buildReport(plan, options);
      }
    } else {
      enrichedReport = buildReport(plan, options);
      isApplyMode = true; // apply step present even if no output
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

// ─── Plan Step Processing ─────────────────────────────────────────────────

/**
 * Process the plan step: scan JSONL for structured data, or fall back
 * to raw text display.
 */
function processPlanStep(
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

// ─── Apply Step Processing ────────────────────────────────────────────────

/**
 * Process the apply step: scan JSONL for apply statuses and diagnostics,
 * or fall back to raw text display.
 */
function processApplyStep(
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

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert a UIDiagnostic from validate/JSONL wire format to the model Diagnostic.
 */
function uiDiagnosticToModel(
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
function addScannerWarnings(
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

function buildErrorReport(
  message: string,
  workspace: string | undefined,
  steps?: readonly { id: string; outcome: string }[],
): Report {
  const report = createEmptyReport();
  report.error = message;
  if (steps !== undefined) report.steps = [...steps];
  if (workspace !== undefined) report.workspace = workspace;
  report.title = buildTitle(report);
  return report;
}

/** Construct GitHub Actions logs URL from environment variables. */
function buildLogsUrl(env: Env): string | undefined {
  const repo = env["GITHUB_REPOSITORY"];
  const runId = env["GITHUB_RUN_ID"];
  if (!repo || !runId) return undefined;
  const attempt = env["GITHUB_RUN_ATTEMPT"] ?? "1";
  return `https://github.com/${repo}/actions/runs/${runId}/attempts/${attempt}`;
}
