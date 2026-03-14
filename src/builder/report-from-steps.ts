/**
 * Builds a Report (any variant) from parsed GitHub Actions steps context.
 *
 * This is the "build" step for the third pipeline (reportFromSteps).
 * It orchestrates: detect tier → read files → build issues → construct
 * the appropriate Report variant with title.
 */

import type { BuildOptions } from "./options.js";
import type { RenderOptions } from "../renderer/options.js";
import type { Env } from "../env/index.js";
import type { Steps, StepData, ReaderOptions } from "../steps/types.js";
import type { Report, StructuredReport, TextFallbackReport, WorkflowReport, ErrorReport } from "../model/report.js";
import type { StepIssue } from "../model/step-issue.js";
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
import { readStepStdout } from "../steps/io.js";
import { getStepOutcome, hasAnyFailedStep, hasAnyFailedKnownStep, buildStepOutcomes } from "../steps/outcomes.js";
import { parsePlan, parseUILog } from "../parser/index.js";
import { buildReport } from "./index.js";
import { buildApplyReport } from "./apply.js";
import { detectTier } from "./tier.js";
import { buildStepIssue } from "./step-issues.js";
import { buildStructuredTitle } from "./title.js";
import { STATUS_SUCCESS, STATUS_FAILURE } from "../model/status-icons.js";
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

/**
 * Build a Report from a steps context JSON string.
 *
 * Returns a Report variant appropriate for the available data:
 * - StructuredReport (Tier 1) when show-plan JSON is available
 * - TextFallbackReport (Tier 3) when only raw stdout is available
 * - WorkflowReport (Tier 4) when no plan output is available
 * - ErrorReport when parsing fails
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
  const knownStepIds = new Set([initStepId, validateStepId, planStepId, showPlanStepId, applyStepId]);

  // Reader options
  const readerOpts: ReaderOptions = {
    allowedDirs: options?.allowedDirs ?? [env["RUNNER_TEMP"] ?? tmpdir()],
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
    maxDisplayRead: DEFAULT_MAX_DISPLAY_READ,
  };

  // Parse steps JSON
  const parseResult = parseSteps(stepsJson);
  if (typeof parseResult === "string") {
    return buildErrorReport("Invalid Steps Context", parseResult, workspace);
  }

  const steps = parseResult;

  // Detect which steps are present
  const showPlanStep = steps[showPlanStepId];
  const planStep = steps[planStepId];
  const applyStep = steps[applyStepId];
  const initStep = steps[initStepId];
  const validateStep = steps[validateStepId];

  // Collect workflow issues (failed init/validate)
  const issues: StepIssue[] = [];
  let hasStepFailures = false;
  if (initStep && getStepOutcome(initStep) === "failure") {
    issues.push(buildStepIssue(initStep, initStepId, readerOpts));
    hasStepFailures = true;
  }
  if (validateStep && getStepOutcome(validateStep) === "failure") {
    issues.push(buildStepIssue(validateStep, validateStepId, readerOpts));
    hasStepFailures = true;
  }

  // Determine report tier
  const tier = detectTier(showPlanStep, planStep, applyStep, readerOpts);

  switch (tier.kind) {
    case "tier1": {
      return buildTier1Report(
        tier.showPlanJson, showPlanStep, showPlanStepId, applyStep, applyStepId,
        steps, knownStepIds, issues, hasStepFailures, workspace, logsUrl,
        readerOpts, options,
      );
    }
    case "tier3": {
      return buildTextFallbackReport(
        tier, steps, knownStepIds, issues, workspace, logsUrl,
      );
    }
    case "tier4": {
      return buildWorkflowReport(steps, workspace, logsUrl);
    }
  }
}

function buildTier1Report(
  showPlanJson: string,
  showPlanStep: StepData | undefined,
  showPlanStepId: string,
  applyStep: StepData | undefined,
  applyStepId: string,
  steps: Steps,
  knownStepIds: ReadonlySet<string>,
  issues: StepIssue[],
  hasStepFailures: boolean,
  workspace: string | undefined,
  logsUrl: string | undefined,
  readerOpts: ReaderOptions,
  options: ReportOptions | undefined,
): Report {
  let report: StructuredReport;
  let isApplyMode = false;

  // Parse the plan JSON
  let plan: ReturnType<typeof parsePlan>;
  try {
    plan = parsePlan(showPlanJson);
  } catch (planErr: unknown) {
    // Plan parse failed — show-plan step produced unreadable output
    if (showPlanStep) {
      issues.push(buildStepIssue(
        showPlanStep,
        showPlanStepId,
        readerOpts,
        `Plan output could not be parsed: ${planErr instanceof Error ? planErr.message : "unknown error"}`,
      ));
    }
    // Fall through to Tier 3 if plan or apply steps have raw output
    const planStep = steps[options?.planStep ?? DEFAULT_PLAN_STEP];
    if (planStep || applyStep) {
      const fallbackTier = detectTier(undefined, planStep, applyStep, readerOpts);
      if (fallbackTier.kind === "tier3") {
        return buildTextFallbackReport(
          fallbackTier, steps, knownStepIds, issues, workspace, logsUrl,
        );
      }
    }
    return buildErrorReport(
      "Plan Processing Error",
      "Plan output could not be parsed",
      workspace,
      buildStepOutcomes(steps),
    );
  }

  // If apply step is present, try to parse its JSONL output
  if (applyStep && getStepOutcome(applyStep) !== "skipped") {
    isApplyMode = true;
    const applyRead = readStepStdout(applyStep, readerOpts);
    if (applyRead.content !== undefined) {
      try {
        const messages = parseUILog(applyRead.content);
        report = buildApplyReport(plan, messages, options);
      } catch (applyErr: unknown) {
        report = buildReport(plan, options);
        issues.push(buildStepIssue(
          applyStep,
          applyStepId,
          readerOpts,
          `Apply output could not be parsed as structured data: ${applyErr instanceof Error ? applyErr.message : "unknown error"}`,
        ));
      }
    } else {
      report = buildReport(plan, options);
    }
  } else {
    report = buildReport(plan, options);
  }

  // Set the cross-cutting fields
  report.title = buildStructuredTitle(report, isApplyMode, workspace, hasStepFailures);
  report.issues = issues;
  report.isApply = isApplyMode;
  if (workspace !== undefined) report.workspace = workspace;
  if (logsUrl !== undefined) report.logsUrl = logsUrl;

  return report;
}

function buildTextFallbackReport(
  tier: { kind: "tier3"; planRead?: { content?: string; truncated?: boolean }; applyRead?: { content?: string; truncated?: boolean }; readErrors: string[] },
  steps: Steps,
  knownStepIds: ReadonlySet<string>,
  issues: StepIssue[],
  workspace: string | undefined,
  logsUrl: string | undefined,
): TextFallbackReport {
  const hasOutput = tier.planRead?.content !== undefined || tier.applyRead?.content !== undefined;
  const hasStepFailure =
    hasAnyFailedStep(steps, knownStepIds)
    || hasAnyFailedKnownStep(steps, knownStepIds);
  const hasIssueFailure = issues.some((i) => i.isFailed);
  const hasFailure = hasStepFailure || hasIssueFailure;
  const icon = hasFailure ? STATUS_FAILURE : STATUS_SUCCESS;
  const wsPrefix = workspace ? `\`${workspace}\` ` : "";
  const isApply = tier.applyRead !== undefined;
  const label = isApply ? "Apply" : "Plan";
  const suffix = hasFailure ? "Failed" : "Succeeded";

  const report: TextFallbackReport = {
    kind: "text-fallback",
    title: `${icon} ${wsPrefix}${label} ${suffix}`,
    issues,
    readErrors: tier.readErrors,
    steps: buildStepOutcomes(steps),
    hasOutput,
  };
  if (tier.planRead?.content !== undefined) (report as { planContent: string }).planContent = tier.planRead.content;
  if (tier.planRead?.truncated === true) (report as { planTruncated: boolean }).planTruncated = true;
  if (tier.applyRead?.content !== undefined) (report as { applyContent: string }).applyContent = tier.applyRead.content;
  if (tier.applyRead?.truncated === true) (report as { applyTruncated: boolean }).applyTruncated = true;
  if (workspace !== undefined) (report as { workspace: string }).workspace = workspace;
  if (logsUrl !== undefined) (report as { logsUrl: string }).logsUrl = logsUrl;
  return report;
}

function buildWorkflowReport(
  steps: Steps,
  workspace: string | undefined,
  logsUrl: string | undefined,
): WorkflowReport {
  const stepOutcomes = buildStepOutcomes(steps);
  const failedSteps = stepOutcomes.filter((s) => s.outcome === "failure");
  const hasFailure = failedSteps.length > 0;
  const icon = hasFailure ? STATUS_FAILURE : STATUS_SUCCESS;
  const wsPrefix = workspace ? `\`${workspace}\` ` : "";

  let label: string;
  if (hasFailure) {
    if (failedSteps.length === 1) {
      const stepName = failedSteps[0]?.id ?? "unknown";
      label = `\`${stepName}\` Failed`;
    } else {
      label = "Failed";
    }
  } else {
    label = "Succeeded";
  }

  const report: WorkflowReport = {
    kind: "workflow",
    title: `${icon} ${wsPrefix}${label}`,
    steps: stepOutcomes,
  };
  if (logsUrl !== undefined) (report as { logsUrl: string }).logsUrl = logsUrl;
  if (workspace !== undefined) (report as { workspace: string }).workspace = workspace;
  return report;
}

function buildErrorReport(
  heading: string,
  message: string,
  workspace: string | undefined,
  steps?: readonly { id: string; outcome: string }[],
): ErrorReport {
  const wsPrefix = workspace ? `\`${workspace}\` ` : "";
  const report: ErrorReport = {
    kind: "error",
    title: `${STATUS_FAILURE} ${wsPrefix}${heading}`,
    message,
  };
  if (steps !== undefined) (report as { steps: readonly { id: string; outcome: string }[] }).steps = steps;
  if (workspace !== undefined) (report as { workspace: string }).workspace = workspace;
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
