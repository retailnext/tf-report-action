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
import { STATUS_SUCCESS, STATUS_FAILURE, DIAGNOSTIC_WARNING } from "./model/status-icons.js";
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
  collectFailedStepIssue(initStep, initStepId, readerOpts, workflowIssues);
  collectFailedStepIssue(validateStep, validateStepId, readerOpts, workflowIssues);

  // Determine report tier
  const tier = detectTier(showPlanStep, planStep, applyStep, readerOpts);

  let report: Report;
  const renderOpts: Options | undefined = options;
  let isApplyMode = false;

  switch (tier.kind) {
    case "tier1": {
      // Full structured report from show-plan JSON
      try {
        const plan = parsePlan(tier.showPlanJson);
        if (applyStep && getStepOutcome(applyStep) !== "skipped") {
          // Apply mode
          const applyJsonl = readStepStdout(applyStep, readerOpts);
          if (applyJsonl !== undefined) {
            const messages = parseUILog(applyJsonl);
            report = buildApplyReport(plan, messages, options);
            isApplyMode = true;
          } else {
            report = buildReport(plan, options);
          }
        } else {
          report = buildReport(plan, options);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to parse plan";
        return renderErrorReport("Plan Processing Error", msg, workspace, maxOutputLength);
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
  const title = buildTitle(report, isApplyMode, workspace, workflowIssues);
  sections.push({ id: "title", full: `## ${title}\n\n`, fixed: true });

  // Workflow issues
  for (const issue of workflowIssues) {
    sections.push(issue);
  }

  // Render the report body (without title — we handle title separately)
  const { title: _title, ...renderOptsNoTitle } = renderOpts ?? {};
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
  | { kind: "tier3"; planStdout?: string; applyStdout?: string }
  | { kind: "tier4" };

function detectTier(
  showPlanStep: StepData | undefined,
  planStep: StepData | undefined,
  applyStep: StepData | undefined,
  readerOpts: ReaderOptions,
): Tier {
  // Tier 1: show-plan JSON available
  if (showPlanStep) {
    const outcome = getStepOutcome(showPlanStep);
    if (outcome === "success") {
      const content = readStepStdout(showPlanStep, readerOpts);
      if (content !== undefined) {
        return { kind: "tier1", showPlanJson: content };
      }
    }
  }

  // Tier 3: Raw text fallback (plan or apply step present but no structured data)
  if (planStep || applyStep) {
    const result: { kind: "tier3"; planStdout?: string; applyStdout?: string } = { kind: "tier3" };
    if (planStep) {
      const stdout = readStepStdout(planStep, readerOpts);
      if (stdout !== undefined) result.planStdout = stdout;
    }
    if (applyStep) {
      const stdout = readStepStdout(applyStep, readerOpts);
      if (stdout !== undefined) result.applyStdout = stdout;
    }
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
  issues: Section[],
): string {
  const hasFailures = report.summary.failures.length > 0;
  const hasIssues = issues.length > 0;
  const icon = hasFailures || hasIssues ? STATUS_FAILURE : STATUS_SUCCESS;
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
  if (totalActions === 0 && !hasFailures && !hasIssues) {
    return `${icon} ${wsPrefix}No Changes`;
  }

  if (hasFailures || hasIssues) {
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

function readStepStdout(step: StepData, readerOpts: ReaderOptions): string | undefined {
  const filePath = step.outputs?.[OUTPUT_STDOUT_FILE];
  if (!filePath) return undefined;
  const result = readForParse(filePath, readerOpts);
  if (isReadError(result)) return undefined;
  return result.content;
}

function readStepStdoutForDisplay(step: StepData, readerOpts: ReaderOptions): string | undefined {
  const filePath = step.outputs?.[OUTPUT_STDOUT_FILE];
  if (!filePath) return undefined;
  const result = readForDisplay(filePath, readerOpts);
  if (isReadError(result)) return undefined;
  return result.truncated ? result.content + "\n… (truncated)" : result.content;
}

function readStepStderrForDisplay(step: StepData, readerOpts: ReaderOptions): string | undefined {
  const filePath = step.outputs?.[OUTPUT_STDERR_FILE];
  if (!filePath) return undefined;
  const result = readForDisplay(filePath, readerOpts);
  if (isReadError(result)) return undefined;
  return result.truncated ? result.content + "\n… (truncated)" : result.content;
}

function collectFailedStepIssue(
  step: StepData | undefined,
  stepId: string,
  readerOpts: ReaderOptions,
  issues: Section[],
): void {
  if (!step) return;
  const outcome = getStepOutcome(step);
  if (outcome !== "failure") return;

  const stdout = readStepStdoutForDisplay(step, readerOpts);
  const stderr = readStepStderrForDisplay(step, readerOpts);

  let content = `### ${STATUS_FAILURE} \`${stepId}\` failed\n\n`;
  if (stdout) {
    content += `<details open>\n<summary>stdout</summary>\n\n\`\`\`\n${stdout}\n\`\`\`\n\n</details>\n\n`;
  }
  if (stderr) {
    content += `<details open>\n<summary>stderr</summary>\n\n\`\`\`\n${stderr}\n\`\`\`\n\n</details>\n\n`;
  }
  if (!stdout && !stderr) {
    content += "No output captured.\n\n";
  }

  issues.push({
    id: `issue-${stepId}`,
    full: content,
    compact: `### ${STATUS_FAILURE} \`${stepId}\` failed\n\n`,
  });
}

// ─── Fallback Renderers ─────────────────────────────────────────────────────

function renderErrorReport(
  heading: string,
  message: string,
  workspace: string | undefined,
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
  const wsPrefix = workspace ? `\`${workspace}\` ` : "";
  sections.push({ id: "title", full: `## ${STATUS_FAILURE} ${wsPrefix}${heading}\n\n`, fixed: true });
  sections.push({ id: "message", full: `${message}\n\n` });
  return composeSections(sections, maxOutputLength).output;
}

function renderTextFallback(
  tier: { kind: "tier3"; planStdout?: string; applyStdout?: string },
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

  const hasFailure = [...issues].length > 0 || hasAnyFailedStep(steps, knownStepIds);
  const icon = hasFailure ? STATUS_FAILURE : STATUS_SUCCESS;
  const wsPrefix = workspace ? `\`${workspace}\` ` : "";
  const label = tier.applyStdout !== undefined ? "Apply" : "Plan";
  sections.push({ id: "title", full: `## ${icon} ${wsPrefix}${label}\n\n`, fixed: true });

  for (const issue of issues) {
    sections.push(issue);
  }

  sections.push({
    id: "note",
    full: "> **Note:** Structured plan output was not available. Showing raw command output.\n\n",
    fixed: true,
  });

  if (tier.planStdout) {
    sections.push({
      id: "plan-output",
      full: `### Plan Output\n\n\`\`\`\n${tier.planStdout}\n\`\`\`\n\n`,
      compact: "### Plan Output\n\n_(omitted due to size)_\n\n",
    });
  }

  if (tier.applyStdout) {
    sections.push({
      id: "apply-output",
      full: `### Apply Output\n\n\`\`\`\n${tier.applyStdout}\n\`\`\`\n\n`,
      compact: "### Apply Output\n\n_(omitted due to size)_\n\n",
    });
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

  const hasFailure = Object.values(steps).some(
    (s) => getStepOutcome(s) === "failure",
  );
  const icon = hasFailure ? STATUS_FAILURE : STATUS_SUCCESS;
  const wsPrefix = workspace ? `\`${workspace}\` ` : "";
  const label = hasFailure ? "Failed" : "Succeeded";
  sections.push({ id: "title", full: `## ${icon} ${wsPrefix}${label}\n\n`, fixed: true });

  // Step list
  const stepEntries = Object.entries(steps);
  if (stepEntries.length > 0) {
    let table = "| Step | Outcome |\n|------|--------|\n";
    for (const [id, step] of stepEntries) {
      const outcome = getStepOutcome(step);
      table += `| \`${id}\` | ${outcome} |\n`;
    }
    table += "\n";
    sections.push({ id: "step-table", full: table });
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


