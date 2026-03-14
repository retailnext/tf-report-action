/**
 * Orchestrates the generation of a markdown report from a GitHub Actions
 * steps context JSON string. This is the primary high-level entry point
 * for the eventual GitHub Action integration.
 *
 * Never throws — all errors are rendered as markdown content.
 * Output is bounded by `maxOutputLength` (default 63 KiB).
 */

import type { Options } from "./index.js";
import type { Env, Steps, StepData } from "./steps/types.js";
import type { Report } from "./model/report.js";
import type { Section } from "./compositor/types.js";
import { parseSteps } from "./steps/parse.js";
import {
  readForParse,
  readForDisplay,
  isReadError,
} from "./steps/reader.js";
import type { ReaderOptions } from "./steps/types.js";
import {
  DEFAULT_INIT_STEP,
  DEFAULT_VALIDATE_STEP,
  DEFAULT_PLAN_STEP,
  DEFAULT_SHOW_PLAN_STEP,
  DEFAULT_APPLY_STEP,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_DISPLAY_READ,
  OUTPUT_STDOUT_FILE,
  OUTPUT_STDERR_FILE,
} from "./steps/types.js";
import { parsePlan, parseUILog } from "./parser/index.js";
import { buildReport } from "./builder/index.js";
import { buildApplyReport } from "./builder/apply.js";
import { renderReport } from "./renderer/index.js";
import { composeSections, DEFAULT_MAX_OUTPUT_LENGTH } from "./compositor/index.js";
import { STATUS_SUCCESS, STATUS_FAILURE, DIAGNOSTIC_WARNING, DIAGNOSTIC_ERROR } from "./model/status-icons.js";
import { tmpdir } from "node:os";

// ─── ReportOptions ──────────────────────────────────────────────────────────

/**
 * Options for `reportFromSteps()`. Extends the standard build/render options
 * with steps-specific configuration.
 */
export interface ReportOptions extends Options {
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

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Generates a GitHub-comment-ready markdown string from a GitHub Actions
 * steps context JSON string.
 *
 * **Never throws.** All errors are rendered as markdown content. Output
 * length is bounded by `maxOutputLength`.
 *
 * @param stepsJson - JSON-encoded GitHub Actions steps context
 * @param options - Report generation options
 * @returns Markdown string suitable for a GitHub issue or PR comment body
 */
export function reportFromSteps(
  stepsJson: string,
  options?: ReportOptions,
): string {
  try {
    return reportFromStepsInner(stepsJson, options);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return `## ${STATUS_FAILURE} Report Generation Failed\n\nAn unexpected error occurred while generating the report:\n\n\`\`\`\n${message}\n\`\`\`\n`;
  }
}

// ─── Internal Orchestration ─────────────────────────────────────────────────

function reportFromStepsInner(
  stepsJson: string,
  options?: ReportOptions,
): string {
  const env = options?.env ?? (process.env as Env);
  const maxOutputLength = options?.maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;
  const workspace = options?.workspace;

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
    return renderErrorReport("Invalid Steps Context", parseResult, workspace, maxOutputLength);
  }

  const steps = parseResult;

  // Detect which steps are present
  const showPlanStep = steps[showPlanStepId];
  const planStep = steps[planStepId];
  const applyStep = steps[applyStepId];
  const initStep = steps[initStepId];
  const validateStep = steps[validateStepId];

  // Collect workflow issues (failed init/validate)
  const workflowIssues: Section[] = [];
  let hasStepFailures = false;
  if (initStep && getStepOutcome(initStep) === "failure") {
    collectStepIssue(initStep, initStepId, readerOpts, workflowIssues);
    hasStepFailures = true;
  }
  if (validateStep && getStepOutcome(validateStep) === "failure") {
    collectStepIssue(validateStep, validateStepId, readerOpts, workflowIssues);
    hasStepFailures = true;
  }

  // Determine report tier
  const tier = detectTier(showPlanStep, planStep, applyStep, readerOpts);

  let report: Report;
  const renderOpts: Options | undefined = options;
  let isApplyMode = false;

  switch (tier.kind) {
    case "tier1": {
      // Step 1: Parse the plan JSON (required for any structured report)
      let plan: ReturnType<typeof parsePlan>;
      try {
        plan = parsePlan(tier.showPlanJson);
      } catch (planErr: unknown) {
        // Plan parse failed — show-plan step produced unreadable output.
        // Treat show-plan as a generic step with a diagnostic, then check
        // whether we can fall back to Tier 3 with apply/plan text output.
        if (showPlanStep) {
          collectStepIssue(
            showPlanStep,
            showPlanStepId,
            readerOpts,
            workflowIssues,
            `Plan output could not be parsed: ${planErr instanceof Error ? planErr.message : "unknown error"}`,
          );
        }
        // Fall through to Tier 3 if plan or apply steps have raw output
        if (planStep || applyStep) {
          const fallbackTier = detectTier(undefined, planStep, applyStep, readerOpts);
          if (fallbackTier.kind === "tier3") {
            return renderTextFallback(fallbackTier, workspace, env, knownStepIds, steps, workflowIssues, maxOutputLength);
          }
        }
        return renderErrorReport("Plan Processing Error", "Plan output could not be parsed", workspace, maxOutputLength, steps);
      }

      // Step 2: If apply step is present, try to parse its JSONL output
      if (applyStep && getStepOutcome(applyStep) !== "skipped") {
        isApplyMode = true;
        const applyRead = readStepStdout(applyStep, readerOpts);
        if (applyRead.content !== undefined) {
          try {
            const messages = parseUILog(applyRead.content);
            report = buildApplyReport(plan, messages, options);
          } catch (applyErr: unknown) {
            // Apply output couldn't be parsed — fall back to plan-only report
            // and show the apply step as a generic IaC step with its raw output
            report = buildReport(plan, options);
            collectStepIssue(
              applyStep,
              applyStepId,
              readerOpts,
              workflowIssues,
              `Apply output could not be parsed as structured data: ${applyErr instanceof Error ? applyErr.message : "unknown error"}`,
            );
          }
        } else {
          report = buildReport(plan, options);
        }
      } else {
        report = buildReport(plan, options);
      }
      break;
    }
    case "tier3": {
      // Raw text fallback
      return renderTextFallback(tier, workspace, env, knownStepIds, steps, workflowIssues, maxOutputLength);
    }
    case "tier4": {
      // General workflow report
      return renderGeneralWorkflow(steps, workspace, env, maxOutputLength);
    }
  }

  // Build sections
  const sections: Section[] = [];

  // Dedup marker (if workspace set)
  if (workspace) {
    sections.push({
      id: "marker",
      full: `<!-- tf-report-action:"${escapeMarkerWorkspace(workspace)}" -->\n`,
      fixed: true,
    });
  }

  // Title
  const title = buildTitle(report, isApplyMode, workspace, hasStepFailures);
  sections.push({ id: "title", full: `## ${title}\n\n`, fixed: true });

  // Workflow issues
  for (const issue of workflowIssues) {
    sections.push(issue);
  }

  // Render the report body (without title — we handle title separately)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { title: _discardTitle, ...renderOptsNoTitle } = renderOpts ?? {};
  const reportMarkdown = renderReport(report, renderOptsNoTitle);
  sections.push({ id: "report-body", full: reportMarkdown });

  // Truncation notice (reserved space)
  const logsUrl = buildLogsUrl(env);
  const truncationNotice = buildTruncationNotice(logsUrl);

  // Compose within budget, reserving space for truncation notice
  const composeBudget = maxOutputLength - truncationNotice.length;
  const result = composeSections(sections, composeBudget);

  if (result.degradedCount > 0 || result.omittedCount > 0) {
    return result.output + truncationNotice;
  }
  return result.output;
}

// ─── Tier Detection ─────────────────────────────────────────────────────────

type Tier =
  | { kind: "tier1"; showPlanJson: string }
  | { kind: "tier3"; planRead?: StepFileRead; applyRead?: StepFileRead; readErrors: string[] }
  | { kind: "tier4" };

function detectTier(
  showPlanStep: StepData | undefined,
  planStep: StepData | undefined,
  applyStep: StepData | undefined,
  readerOpts: ReaderOptions,
): Tier {
  const readErrors: string[] = [];

  // Tier 1: show-plan JSON available
  if (showPlanStep) {
    const outcome = getStepOutcome(showPlanStep);
    if (outcome === "success") {
      const read = readStepStdout(showPlanStep, readerOpts);
      if (read.content !== undefined) {
        return { kind: "tier1", showPlanJson: read.content };
      }
      if (read.error) {
        readErrors.push(`${DIAGNOSTIC_WARNING} show-plan stdout: ${read.error}`);
      } else if (read.noFile) {
        readErrors.push(`${DIAGNOSTIC_WARNING} show-plan: stdout_file output missing in steps`);
      }
    }
  }

  // Tier 3: Raw text fallback (plan or apply step present but no structured data)
  if (planStep || applyStep) {
    let planRead: StepFileRead | undefined;
    let applyRead: StepFileRead | undefined;
    if (planStep) {
      planRead = readStepStdout(planStep, readerOpts);
      if (planRead.error) readErrors.push(`${DIAGNOSTIC_WARNING} plan stdout: ${planRead.error}`);
      else if (planRead.noFile) readErrors.push(`${DIAGNOSTIC_WARNING} plan: stdout_file output missing in steps`);
    }
    if (applyStep && getStepOutcome(applyStep) !== "skipped") {
      applyRead = readStepStdout(applyStep, readerOpts);
      if (applyRead.error) readErrors.push(`${DIAGNOSTIC_WARNING} apply stdout: ${applyRead.error}`);
      else if (applyRead.noFile) readErrors.push(`${DIAGNOSTIC_WARNING} apply: stdout_file output missing in steps`);
    }
    const result: Tier = { kind: "tier3", readErrors };
    if (planRead) (result as { planRead?: StepFileRead }).planRead = planRead;
    if (applyRead) (result as { applyRead?: StepFileRead }).applyRead = applyRead;
    return result;
  }

  // Tier 4: General workflow
  return { kind: "tier4" };
}

// ─── Title Generation ───────────────────────────────────────────────────────

function buildTitle(
  report: Report,
  isApply: boolean,
  workspace: string | undefined,
  hasStepFailures: boolean,
): string {
  const hasFailures = report.summary.failures.length > 0;
  const icon = hasFailures || hasStepFailures ? STATUS_FAILURE : STATUS_SUCCESS;
  const wsPrefix = workspace ? `\`${workspace}\` ` : "";

  if (isApply) {
    const parts = buildApplyCountParts(report);
    if (hasFailures) {
      const failParts = buildFailureCountParts(report);
      return `${icon} ${wsPrefix}Apply Failed: ${[...failParts, ...parts].join(", ")}`;
    }
    if (parts.length === 0) {
      return `${icon} ${wsPrefix}Apply Complete`;
    }
    return `${icon} ${wsPrefix}Apply: ${parts.join(", ")}`;
  }

  // Plan mode
  const totalActions = report.summary.actions.reduce((sum, g) => sum + g.total, 0);
  if (totalActions === 0 && !hasFailures && !hasStepFailures) {
    return `${icon} ${wsPrefix}No Changes`;
  }

  if (hasFailures || hasStepFailures) {
    return `${icon} ${wsPrefix}Plan Failed`;
  }

  const parts = buildPlanCountParts(report);
  return `${icon} ${wsPrefix}Plan: ${parts.join(", ")}`;
}

function buildPlanCountParts(report: Report): string[] {
  const counts = new Map<string, number>();
  for (const group of report.summary.actions) {
    const label = planActionLabel(group.action);
    counts.set(label, (counts.get(label) ?? 0) + group.total);
  }
  return formatCountParts(counts, "to ");
}

function buildApplyCountParts(report: Report): string[] {
  const counts = new Map<string, number>();
  for (const group of report.summary.actions) {
    const label = applyActionLabel(group.action);
    counts.set(label, (counts.get(label) ?? 0) + group.total);
  }
  return formatCountParts(counts, "");
}

function buildFailureCountParts(report: Report): string[] {
  const total = report.summary.failures.reduce((sum, g) => sum + g.total, 0);
  if (total === 0) return [];
  return [`${String(total)} failed`];
}

function formatCountParts(counts: Map<string, number>, prefix: string): string[] {
  const parts: string[] = [];
  for (const [label, count] of counts) {
    parts.push(`${String(count)} ${prefix}${label}`);
  }
  return parts;
}

function planActionLabel(action: string): string {
  switch (action) {
    case "create": return "add";
    case "update": return "change";
    case "delete": return "destroy";
    case "replace": return "replace";
    case "import": return "import";
    default: return action;
  }
}

function applyActionLabel(action: string): string {
  switch (action) {
    case "create": return "added";
    case "update": return "changed";
    case "delete": return "destroyed";
    case "replace": return "replaced";
    case "import": return "imported";
    default: return action;
  }
}

// ─── Workspace Marker ───────────────────────────────────────────────────────

function escapeMarkerWorkspace(workspace: string): string {
  return workspace
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/-->/g, "--\\>")
    .replace(/--!>/g, "--!\\>");
}

// ─── Logs URL ───────────────────────────────────────────────────────────────

function buildLogsUrl(env: Env): string | undefined {
  const repo = env["GITHUB_REPOSITORY"];
  const runId = env["GITHUB_RUN_ID"];
  if (!repo || !runId) return undefined;
  const attempt = env["GITHUB_RUN_ATTEMPT"] ?? "1";
  return `https://github.com/${repo}/actions/runs/${runId}/attempts/${attempt}`;
}

// ─── Truncation Notice ──────────────────────────────────────────────────────

function buildTruncationNotice(logsUrl: string | undefined): string {
  if (logsUrl) {
    return `\n---\n\n> ${DIAGNOSTIC_WARNING} **Output truncated** — some details were shortened or omitted to fit within the comment size limit.\n> [View full workflow run logs](${logsUrl})\n`;
  }
  return `\n---\n\n> ${DIAGNOSTIC_WARNING} **Output truncated** — some details were shortened or omitted to fit within the comment size limit. Check the workflow run logs for complete output.\n`;
}

// ─── Step Helpers ───────────────────────────────────────────────────────────

function getStepOutcome(step: StepData): string {
  return step.outcome ?? step.conclusion ?? "unknown";
}

/** Result of attempting to read a step's stdout/stderr file. */
interface StepFileRead {
  /** The file content, if successfully read. */
  content?: string;
  /** Whether the content was truncated. */
  truncated?: boolean;
  /** Error message if the read failed. */
  error?: string;
  /** True when the step had no file path configured. */
  noFile?: boolean;
}

function readStepFile(step: StepData, outputKey: string, readerOpts: ReaderOptions, forDisplay: boolean): StepFileRead {
  const filePath = step.outputs?.[outputKey];
  if (!filePath) return { noFile: true };
  const result = forDisplay ? readForDisplay(filePath, readerOpts) : readForParse(filePath, readerOpts);
  if (isReadError(result)) return { error: result.error };
  if (result.truncated) {
    return { content: result.content, truncated: true };
  }
  return { content: result.content };
}

function readStepStdout(step: StepData, readerOpts: ReaderOptions): StepFileRead {
  return readStepFile(step, OUTPUT_STDOUT_FILE, readerOpts, false);
}

function readStepStdoutForDisplay(step: StepData, readerOpts: ReaderOptions): StepFileRead {
  return readStepFile(step, OUTPUT_STDOUT_FILE, readerOpts, true);
}

function readStepStderrForDisplay(step: StepData, readerOpts: ReaderOptions): StepFileRead {
  return readStepFile(step, OUTPUT_STDERR_FILE, readerOpts, true);
}

/**
 * Collects a step's status and raw output into an issue section. Works for
 * any step outcome (not just failures). An optional `diagnostic` message is
 * rendered as a blockquote note explaining why this step appears here
 * (e.g., "Apply output could not be parsed as structured data").
 */
function collectStepIssue(
  step: StepData,
  stepId: string,
  readerOpts: ReaderOptions,
  issues: Section[],
  diagnostic?: string,
): void {
  const outcome = getStepOutcome(step);
  const isFailed = outcome === "failure";
  const icon = isFailed ? STATUS_FAILURE : DIAGNOSTIC_WARNING;

  // For failures, the heading says "failed". For non-failures with a
  // diagnostic (e.g. parse error), summarize the problem instead of
  // showing the confusing "⚠️ show-plan success" pattern.
  let heading: string;
  if (isFailed) {
    heading = `\`${stepId}\` failed`;
  } else if (diagnostic) {
    heading = `\`${stepId}\`: output could not be parsed`;
  } else {
    heading = `\`${stepId}\` ${outcome}`;
  }

  let content = `### ${icon} ${heading}\n\n`;
  if (diagnostic) {
    content += `> ${diagnostic}\n\n`;
  }

  const stdoutRead = readStepStdoutForDisplay(step, readerOpts);
  const stderrRead = readStepStderrForDisplay(step, readerOpts);

  if (stdoutRead.content) {
    const displayContent = stdoutRead.truncated ? stdoutRead.content + "\n… (truncated)" : stdoutRead.content;
    const formatted = formatRawOutput(displayContent);
    content += `<details open>\n<summary>stdout</summary>\n\n${formatted}\n\n</details>\n\n`;
  } else if (stdoutRead.error) {
    content += `> ${DIAGNOSTIC_WARNING} stdout not available: ${stdoutRead.error}\n\n`;
  }
  if (stderrRead.content) {
    const displayContent = stderrRead.truncated ? stderrRead.content + "\n… (truncated)" : stderrRead.content;
    content += `<details open>\n<summary>stderr</summary>\n\n\`\`\`\n${displayContent}\n\`\`\`\n\n</details>\n\n`;
  } else if (stderrRead.error) {
    content += `> ${DIAGNOSTIC_WARNING} stderr not available: ${stderrRead.error}\n\n`;
  }
  if (!stdoutRead.content && !stderrRead.content && !stdoutRead.error && !stderrRead.error) {
    content += "No output captured.\n\n";
  }

  issues.push({
    id: `issue-${stepId}`,
    full: content,
    compact: `### ${icon} ${heading}\n\n`,
  });
}

// ─── Fallback Renderers ─────────────────────────────────────────────────────

function renderErrorReport(
  heading: string,
  message: string,
  workspace: string | undefined,
  maxOutputLength: number,
  steps?: Steps,
): string {
  const sections: Section[] = [];
  if (workspace) {
    sections.push({
      id: "marker",
      full: `<!-- tf-report-action:"${escapeMarkerWorkspace(workspace)}" -->\n`,
      fixed: true,
    });
  }
  const wsPrefix = workspace ? `\`${workspace}\` ` : "";
  sections.push({ id: "title", full: `## ${STATUS_FAILURE} ${wsPrefix}${heading}\n\n`, fixed: true });
  sections.push({ id: "message", full: `${message}\n\n` });

  if (steps) {
    const stepLines = renderStepStatusList(steps, new Set());
    if (stepLines.length > 0) {
      sections.push({ id: "step-statuses", full: `### Steps\n\n${stepLines}\n` });
    }
  }

  return composeSections(sections, maxOutputLength).output;
}

function renderTextFallback(
  tier: { kind: "tier3"; planRead?: StepFileRead; applyRead?: StepFileRead; readErrors: string[] },
  workspace: string | undefined,
  env: Env,
  knownStepIds: Set<string>,
  steps: Steps,
  issues: Section[],
  maxOutputLength: number,
): string {
  const sections: Section[] = [];
  if (workspace) {
    sections.push({
      id: "marker",
      full: `<!-- tf-report-action:"${escapeMarkerWorkspace(workspace)}" -->\n`,
      fixed: true,
    });
  }

  // Check for failures: issues (init/validate), any non-terraform step failures,
  // or failed terraform steps (plan, show-plan, apply) that we're falling back from.
  // Note: issues from non-failure steps (e.g. parse warnings) are NOT treated as
  // failures for the title — only actual step failures trigger ❌.
  const hasStepFailure =
    hasAnyFailedStep(steps, knownStepIds)
    || hasAnyFailedKnownStep(steps, knownStepIds);
  const hasIssueFailure = issues.some(
    (s) => s.full.startsWith(`### ${STATUS_FAILURE}`),
  );
  const hasFailure = hasStepFailure || hasIssueFailure;
  const icon = hasFailure ? STATUS_FAILURE : STATUS_SUCCESS;
  const wsPrefix = workspace ? `\`${workspace}\` ` : "";
  const isApply = tier.applyRead !== undefined;
  const label = isApply ? "Apply" : "Plan";
  const suffix = hasFailure ? "Failed" : "Succeeded";
  sections.push({ id: "title", full: `## ${icon} ${wsPrefix}${label} ${suffix}\n\n`, fixed: true });

  for (const issue of issues) {
    sections.push(issue);
  }

  // Promote read errors to standalone warning sections at the same level as
  // step issues, rather than nesting them as sub-bullets under a note.
  for (const err of tier.readErrors) {
    sections.push({
      id: `read-error-${err}`,
      full: `### ${err}\n\n`,
      fixed: true,
    });
  }

  const hasOutput = tier.planRead?.content !== undefined || tier.applyRead?.content !== undefined;

  if (hasOutput) {
    sections.push({
      id: "note",
      full: `> ${DIAGNOSTIC_WARNING} **Warning:** Structured plan output was not available. Showing raw command output.\n\n`,
      fixed: true,
    });
  } else if (tier.readErrors.length === 0) {
    sections.push({
      id: "note",
      full: "> **Note:** No readable output was available for this run.\n\n",
      fixed: true,
    });
  }

  if (tier.planRead?.content) {
    const displayContent = tier.planRead.truncated ? tier.planRead.content + "\n… (truncated)" : tier.planRead.content;
    sections.push({
      id: "plan-output",
      full: `### Plan Output\n\n${formatRawOutput(displayContent)}\n\n`,
      compact: "### Plan Output\n\n_(omitted due to size)_\n\n",
    });
  }

  if (tier.applyRead?.content) {
    const displayContent = tier.applyRead.truncated ? tier.applyRead.content + "\n… (truncated)" : tier.applyRead.content;
    sections.push({
      id: "apply-output",
      full: `### Apply Output\n\n${formatRawOutput(displayContent)}\n\n`,
      compact: "### Apply Output\n\n_(omitted due to size)_\n\n",
    });
  }

  // When no output was readable, show step statuses so the user gets something useful
  if (!hasOutput) {
    // Show all steps (don't exclude known IDs — in this fallback, the user needs
    // to see everything since we couldn't read the actual output)
    const stepLines = renderStepStatusList(steps, new Set());
    if (stepLines.length > 0) {
      sections.push({
        id: "step-statuses",
        full: `### Steps\n\n${stepLines}\n`,
      });
    }
  }

  const logsUrl = buildLogsUrl(env);
  const truncationNotice = buildTruncationNotice(logsUrl);
  const composeBudget = maxOutputLength - truncationNotice.length;
  const result = composeSections(sections, composeBudget);
  if (result.degradedCount > 0 || result.omittedCount > 0) {
    return result.output + truncationNotice;
  }
  return result.output;
}

function renderGeneralWorkflow(
  steps: Steps,
  workspace: string | undefined,
  env: Env,
  maxOutputLength: number,
): string {
  const sections: Section[] = [];
  if (workspace) {
    sections.push({
      id: "marker",
      full: `<!-- tf-report-action:"${escapeMarkerWorkspace(workspace)}" -->\n`,
      fixed: true,
    });
  }

  const failedSteps = Object.entries(steps).filter(
    ([, step]) => getStepOutcome(step) === "failure",
  );
  const hasFailure = failedSteps.length > 0;
  const icon = hasFailure ? STATUS_FAILURE : STATUS_SUCCESS;
  const wsPrefix = workspace ? `\`${workspace}\` ` : "";
  let label: string;
  if (hasFailure) {
    if (failedSteps.length === 1) {
      const stepName = failedSteps[0]?.[0] ?? "unknown";
      label = `\`${stepName}\` Failed`;
    } else {
      label = "Failed";
    }
  } else {
    label = "Succeeded";
  }
  sections.push({ id: "title", full: `## ${icon} ${wsPrefix}${label}\n\n`, fixed: true });

  // Step list
  const stepEntries = Object.entries(steps);
  if (stepEntries.length > 0) {
    sections.push({ id: "step-table", full: renderStepStatusList(steps, new Set()) });
  } else {
    sections.push({ id: "no-steps", full: "No steps were found in the workflow context.\n\n" });
  }

  const logsUrl = buildLogsUrl(env);
  if (logsUrl) {
    sections.push({
      id: "logs-link",
      full: `[View workflow run logs](${logsUrl})\n`,
    });
  }

  return composeSections(sections, maxOutputLength).output;
}

function hasAnyFailedStep(steps: Steps, knownStepIds: Set<string>): boolean {
  return Object.entries(steps).some(
    ([id, step]) => !knownStepIds.has(id) && getStepOutcome(step) === "failure",
  );
}

/** Checks if any known IaC step (init, validate, plan, etc.) has failed. */
function hasAnyFailedKnownStep(steps: Steps, knownStepIds: Set<string>): boolean {
  return Object.entries(steps).some(
    ([id, step]) => knownStepIds.has(id) && getStepOutcome(step) === "failure",
  );
}

/**
 * Render a markdown table of step statuses. When `excludeIds` is provided,
 * those step IDs are excluded from the table (they're typically rendered
 * inline elsewhere in the report).
 */
function renderStepStatusList(steps: Steps, excludeIds: Set<string>): string {
  const entries = Object.entries(steps).filter(([id]) => !excludeIds.has(id));
  if (entries.length === 0) return "";
  let table = "| Step | Outcome |\n|------|--------|\n";
  for (const [id, step] of entries) {
    const outcome = getStepOutcome(step);
    table += `| \`${id}\` | ${outcome} |\n`;
  }
  return table + "\n";
}

// ─── Raw Output Formatting ─────────────────────────────────────────────────

/**
 * Format raw output content for display. If the content appears to be
 * Terraform/OpenTofu JSON Lines (`@message` envelope), renders it as a
 * human-friendly structured list with level-based icons. If it appears to
 * be a validation result (single JSON object with `diagnostics`), formats
 * the diagnostics. Otherwise falls back to a plain code block.
 *
 * Exported for unit testing.
 */
export function formatRawOutput(content: string): string {
  const trimmed = content.trim();
  if (trimmed === "") return "```\n(empty)\n```";

  // Try single-object validation result first
  const validateResult = tryFormatValidateOutput(trimmed);
  if (validateResult !== undefined) return validateResult;

  // Try JSON Lines format
  const jsonlResult = tryFormatJsonLines(trimmed);
  if (jsonlResult !== undefined) return jsonlResult;

  // Fallback: raw code block
  return `\`\`\`\n${content}\n\`\`\``;
}

/** Parsed JSON Lines message with known envelope fields. */
interface JsonLinesMsg {
  "@level"?: string;
  "@message"?: string;
  "@module"?: string;
  "@timestamp"?: string;
  type?: string;
  [key: string]: unknown;
}

/** Envelope keys excluded when flattening extra fields. */
const ENVELOPE_KEYS = new Set(["@level", "@message", "@module", "@timestamp", "type"]);

/**
 * Dot-flatten a JSON value into sorted `key=value` pairs.
 *
 * Nested objects produce dotted keys (`hook.resource.addr`).
 * Arrays produce indexed keys (`items.0`, `items.1`).
 * Scalar values are stringified; long values (>80 chars) are truncated.
 */
function flattenJsonFields(
  obj: Record<string, unknown>,
  skipKeys: Set<string>,
): string[] {
  const pairs: [string, string][] = [];

  function walk(value: unknown, prefix: string): void {
    if (value === null || value === undefined) {
      pairs.push([prefix, String(value)]);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        walk(record[key], prefix ? `${prefix}.${key}` : key);
      }
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        walk(value[i], `${prefix}.${String(i)}`);
      }
    } else {
      let str = typeof value === "string" ? value : JSON.stringify(value);
      if (str.length > 80) {
        str = str.slice(0, 77) + "...";
      }
      pairs.push([prefix, str]);
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (skipKeys.has(key)) continue;
    walk(value, key);
  }

  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  return pairs.map(([k, v]) => `\`${k}=${v}\``);
}

/**
 * Format a single JSON Lines message in pretty-json-log style.
 *
 * Messages with extra fields beyond the envelope are wrapped in a
 * `<details>` block so the fields can be expanded. Messages without
 * extra fields render as a plain backtick-wrapped paragraph.
 */
function formatJsonLinesMessage(msg: JsonLinesMsg): string {
  const level = typeof msg["@level"] === "string" ? msg["@level"] : "info";
  const message = typeof msg["@message"] === "string" ? msg["@message"] : "(no message)";
  const icon = levelIcon(level);
  const prefix = icon ? `${icon} ` : "";
  const typeStr = typeof msg.type === "string" ? msg.type : "";
  const typeSuffix = typeStr ? ` \`type=${typeStr}\`` : "";

  const fields = flattenJsonFields(msg as Record<string, unknown>, ENVELOPE_KEYS);

  if (fields.length === 0) {
    return `${prefix}\`${message}\`${typeSuffix}`;
  }

  const fieldLines = fields.join("\n\n");
  return `<details>\n<summary>${prefix}\`${message}\`${typeSuffix}</summary>\n\n${fieldLines}\n\n</details>`;
}

/**
 * Try to parse content as Terraform/OpenTofu JSON Lines and format it.
 * Returns undefined if the content is not valid JSON Lines with `@message`.
 *
 * Each message renders as a backtick-wrapped paragraph with a `type=X` suffix.
 * Messages with extra fields beyond the envelope are expandable via `<details>`.
 * Fields are dot-flattened, sorted lexicographically, one per line.
 */
function tryFormatJsonLines(content: string): string | undefined {
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return undefined;

  const messages: JsonLinesMsg[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return undefined;
      }
      messages.push(parsed as JsonLinesMsg);
    } catch {
      return undefined;
    }
  }

  // Require that at least one message has @message to identify as JSON Lines
  if (!messages.some((m) => typeof m["@message"] === "string")) {
    return undefined;
  }

  // Categorize messages by level for display
  const infoAndAbove: JsonLinesMsg[] = [];
  const debugTrace: JsonLinesMsg[] = [];

  for (const msg of messages) {
    const level = typeof msg["@level"] === "string" ? msg["@level"] : "info";
    if (level === "trace" || level === "debug") {
      debugTrace.push(msg);
    } else {
      infoAndAbove.push(msg);
    }
  }

  const parts: string[] = [];

  for (const msg of infoAndAbove) {
    parts.push(formatJsonLinesMessage(msg));
  }

  // Show debug/trace summary if any exist
  if (debugTrace.length > 0) {
    const counts = new Map<string, number>();
    for (const msg of debugTrace) {
      const level = typeof msg["@level"] === "string" ? msg["@level"] : "debug";
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    const countParts = [...counts.entries()].map(([l, c]) => `${String(c)} ${l}`);
    const inner = debugTrace
      .map((msg) => {
        const message = typeof msg["@message"] === "string" ? msg["@message"] : "(no message)";
        return `\`${message}\``;
      })
      .join("\n\n");
    parts.push(`<details>\n<summary>${countParts.join(", ")} message(s) omitted</summary>\n\n${inner}\n\n</details>`);
  }

  return parts.join("\n\n") + "\n";
}

/** Return the appropriate icon for a JSON Lines @level value. */
function levelIcon(level: string): string {
  switch (level) {
    case "error": return DIAGNOSTIC_ERROR;
    case "warn": return DIAGNOSTIC_WARNING;
    default: return "";
  }
}



/**
 * Try to parse content as a Terraform validate JSON result and format
 * its diagnostics. Returns undefined if the content is not a validate result.
 */
function tryFormatValidateOutput(content: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const obj = parsed as Record<string, unknown>;
  if (!("valid" in obj) || !("diagnostics" in obj) || !Array.isArray(obj["diagnostics"])) {
    return undefined;
  }

  const valid = obj["valid"] as boolean;
  const diagnostics = obj["diagnostics"] as Record<string, unknown>[];

  let output = "";
  if (valid) {
    output += `${STATUS_SUCCESS} Configuration is valid\n\n`;
  } else {
    output += `${STATUS_FAILURE} Configuration is **invalid**\n\n`;
  }

  if (diagnostics.length > 0) {
    for (const diag of diagnostics) {
      const severity = typeof diag["severity"] === "string" ? diag["severity"] : "error";
      const icon = severity === "warning" ? DIAGNOSTIC_WARNING : DIAGNOSTIC_ERROR;
      const summary = typeof diag["summary"] === "string" ? diag["summary"] : "(unknown)";
      const detail = typeof diag["detail"] === "string" ? diag["detail"] : "";

      output += `${icon} **${summary}**\n`;
      if (detail) {
        const detailLines = detail.split("\n").map((l) => `> ${l}`).join("\n");
        output += `${detailLines}\n`;
      }

      const snippet = diag["snippet"] as Record<string, unknown> | undefined;
      if (snippet && typeof snippet["code"] === "string") {
        const lineInfo = typeof snippet["start_line"] === "number" ? ` (line ${String(snippet["start_line"])})` : "";
        const ctx = typeof snippet["context"] === "string" ? ` in ${snippet["context"]}` : "";
        output += `> \`${snippet["code"]}\`${ctx}${lineInfo}\n`;
      }
      output += "\n";
    }
  }

  // Add collapsed raw JSON
  output += `<details>\n<summary>Show raw JSON</summary>\n\n\`\`\`json\n${content}\n\`\`\`\n\n</details>`;

  return output;
}


