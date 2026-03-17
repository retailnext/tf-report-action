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
 *
 * Per-step processing logic lives in dedicated modules:
 * - process-validate.ts — validate step
 * - process-show-plan.ts — show-plan step
 * - process-plan.ts — plan step (JSONL + raw text)
 * - process-apply.ts — apply step (JSONL + raw text)
 */

import type { BuildOptions } from "./options.js";
import type { RenderOptions } from "../model/render-options.js";
import type { Env } from "../env/index.js";
import type { ReaderOptions } from "../steps/types.js";
import type { Report, Tool } from "../model/report.js";
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
import { getStepOutcome, buildStepOutcomes } from "../steps/outcomes.js";
import { buildStepIssue, shouldCreateStepIssue } from "./step-issues.js";
import { buildTitle } from "./title.js";
import { processValidateStep } from "./process-validate.js";
import { tryProcessShowPlan } from "./process-show-plan.js";
import { processPlanStep } from "./process-plan.js";
import { processApplyStep } from "./process-apply.js";
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
  /**
   * Maximum bytes to read from a step's stdout/stderr file for display.
   * Default: 64 KiB. Set lower in tests to exercise truncation paths.
   */
  maxDisplayRead?: number;
  /** Step ID for the init step. Default: "init" */
  initStepId?: string;
  /** Step ID for the validate step. Default: "validate" */
  validateStepId?: string;
  /** Step ID for the plan step. Default: "plan" */
  planStepId?: string;
  /** Step ID for the show-plan step. Default: "show-plan" */
  showPlanStepId?: string;
  /** Step ID for the apply step. Default: "apply" */
  applyStepId?: string;
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
  const initStepId = options?.initStepId ?? DEFAULT_INIT_STEP;
  const validateStepId = options?.validateStepId ?? DEFAULT_VALIDATE_STEP;
  const planStepId = options?.planStepId ?? DEFAULT_PLAN_STEP;
  const showPlanStepId = options?.showPlanStepId ?? DEFAULT_SHOW_PLAN_STEP;
  const applyStepId = options?.applyStepId ?? DEFAULT_APPLY_STEP;
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
    maxDisplayRead: options?.maxDisplayRead ?? DEFAULT_MAX_DISPLAY_READ,
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

  // ─── Phase 3: Unfamiliar step issues ──────────────────────────
  for (const [stepId, step] of Object.entries(steps)) {
    if (knownStepIds.has(stepId)) continue;
    if (shouldCreateStepIssue(step, readerOpts)) {
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

// ─── Helpers ──────────────────────────────────────────────────────────────

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
