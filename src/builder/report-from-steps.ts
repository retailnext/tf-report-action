/**
 * Builds a Report from parsed GitHub Actions steps context.
 *
 * This is the "build" step for the reportFromSteps pipeline.
 * It orchestrates: detect tier → read files → build issues → construct
 * a progressively-enriched Report with title.
 */

import type { BuildOptions } from "./options.js";
import type { RenderOptions } from "../renderer/options.js";
import type { Env } from "../env/index.js";
import type { Steps, StepData, ReaderOptions } from "../steps/types.js";
import type { Report, Tool } from "../model/report.js";
import type { StepIssue } from "../model/step-issue.js";
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
import { readStepStdout } from "../steps/io.js";
import { getStepOutcome, hasAnyFailedStep, hasAnyFailedKnownStep, buildStepOutcomes } from "../steps/outcomes.js";
import { parsePlan, parseUILog, detectToolFromPlan, detectToolFromOutput } from "../parser/index.js";
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

  // Tool name — explicit override or auto-detected later
  let tool: Tool | undefined = options?.tool;

  switch (tier.kind) {
    case "tier1": {
      return buildTier1Report(
        tier.showPlanJson, showPlanStep, showPlanStepId, applyStep, applyStepId,
        steps, knownStepIds, issues, hasStepFailures, workspace, logsUrl,
        readerOpts, options, tool,
      );
    }
    case "tier3": {
      // Auto-detect tool from available raw content
      tool ??= detectToolFromOutput(tier.planRead?.content)
            ?? detectToolFromOutput(tier.applyRead?.content);
      return buildTextFallbackReport(
        tier, steps, knownStepIds, issues, workspace, logsUrl, tool,
      );
    }
    case "tier4": {
      return buildWorkflowOnlyReport(steps, workspace, logsUrl);
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
  tool: Tool | undefined,
): Report {
  let report: Report;
  let isApplyMode = false;

  // Parse the plan JSON
  let plan: ReturnType<typeof parsePlan>;
  try {
    plan = parsePlan(showPlanJson);
  } catch (planErr: unknown) {
    // Plan parse failed — show-plan step produced unparseable output.
    // Try to detect the tool from the raw content before falling back.
    tool ??= detectToolFromOutput(showPlanJson);

    const errorDetail = planErr instanceof Error ? planErr.message : "unknown error";
    const commandHint = expectedCommand(tool, "show-plan");
    if (showPlanStep) {
      issues.push(buildStepIssue(
        showPlanStep,
        showPlanStepId,
        readerOpts,
        `Plan output could not be parsed: ${errorDetail}. Expected output from \`${commandHint}\`.`,
      ));
    }
    // Fall through to Tier 3 if plan or apply steps have raw output
    const planStep = steps[options?.planStep ?? DEFAULT_PLAN_STEP];
    if (planStep || applyStep) {
      const fallbackTier = detectTier(undefined, planStep, applyStep, readerOpts);
      if (fallbackTier.kind === "tier3") {
        // Try to detect tool from fallback content too
        tool ??= detectToolFromOutput(fallbackTier.planRead?.content)
              ?? detectToolFromOutput(fallbackTier.applyRead?.content);
        return buildTextFallbackReport(
          fallbackTier, steps, knownStepIds, issues, workspace, logsUrl, tool,
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

  // Auto-detect tool from the successfully parsed plan
  tool ??= detectToolFromPlan(plan);

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
        // Auto-detect tool from apply content if still unknown
        tool ??= detectToolFromOutput(applyRead.content);
        const errorDetail = applyErr instanceof Error ? applyErr.message : "unknown error";
        const commandHint = expectedCommand(tool, "apply");
        issues.push(buildStepIssue(
          applyStep,
          applyStepId,
          readerOpts,
          `Apply output could not be parsed: ${errorDetail}. Expected JSON Lines output from \`${commandHint}\`.`,
        ));
      }
    } else {
      report = buildReport(plan, options);
    }
  } else {
    report = buildReport(plan, options);
  }

  // Set the cross-cutting fields
  report.operation = isApplyMode ? "apply" : "plan";
  report.title = buildStructuredTitle(report, isApplyMode, workspace, hasStepFailures);
  report.issues = issues;
  report.steps = buildStepOutcomes(steps);
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
  tool: Tool | undefined,
): Report {
  const report = createEmptyReport();
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

  report.title = `${icon} ${wsPrefix}${label} ${suffix}`;
  report.issues = issues;
  report.steps = buildStepOutcomes(steps);
  if (tool !== undefined) report.tool = tool;
  report.operation = isApply ? "apply" : "plan";
  if (workspace !== undefined) report.workspace = workspace;
  if (logsUrl !== undefined) report.logsUrl = logsUrl;

  // Add read errors as warnings
  for (const err of tier.readErrors) {
    report.warnings.push(err);
  }

  // Add raw stdout blocks
  const hasOutput = tier.planRead?.content !== undefined || tier.applyRead?.content !== undefined;
  if (tier.planRead?.content !== undefined) {
    report.rawStdout.push({
      stepId: "plan",
      label: "Plan Output",
      content: tier.planRead.content,
      truncated: tier.planRead.truncated === true,
    });
  }
  if (tier.applyRead?.content !== undefined) {
    report.rawStdout.push({
      stepId: "apply",
      label: "Apply Output",
      content: tier.applyRead.content,
      truncated: tier.applyRead.truncated === true,
    });
  }

  // Add warning about limited report (only when we have output to show)
  if (hasOutput) {
    report.warnings.push(
      `Report limited because \`${expectedCommand(tool, "show-plan")}\` output was not available. Showing raw command output.`,
    );
  }

  return report;
}

function buildWorkflowOnlyReport(
  steps: Steps,
  workspace: string | undefined,
  logsUrl: string | undefined,
): Report {
  const report = createEmptyReport();
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

  report.title = `${icon} ${wsPrefix}${label}`;
  report.steps = stepOutcomes;
  if (logsUrl !== undefined) report.logsUrl = logsUrl;
  if (workspace !== undefined) report.workspace = workspace;
  return report;
}

function buildErrorReport(
  heading: string,
  message: string,
  workspace: string | undefined,
  steps?: readonly { id: string; outcome: string }[],
): Report {
  const wsPrefix = workspace ? `\`${workspace}\` ` : "";
  const report = createEmptyReport();
  report.title = `${STATUS_FAILURE} ${wsPrefix}${heading}`;
  report.error = message;
  if (steps !== undefined) report.steps = [...steps];
  if (workspace !== undefined) report.workspace = workspace;
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
