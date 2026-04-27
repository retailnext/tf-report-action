/**
 * Step issue element — renders a step failure or warning with collapsible
 * stdout/stderr content.
 *
 * Has 2 levels:
 * - Level 0 (compact): heading only
 * - Level 1 (full): heading + exit code + diagnostic + stdout/stderr
 */

import type { OutputFormat } from "../renderable/types.js";
import type { ReportElement } from "../renderable/types.js";
import type { StepIssue } from "../model/step-issue.js";
import { Blockquote, Details } from "../renderable/primitives.js";
import { detailsSummary, mdCodeSpan } from "../renderable/helpers.js";
import { htmlEscape } from "../renderable/html-escape.js";
import { markdownEscape } from "../renderable/markdown-escape.js";
import { STATUS_FAILURE, DIAGNOSTIC_WARNING } from "../model/status-icons.js";
import { buildRawOutputRenderable } from "./raw-output.js";

/**
 * A step issue with 2 detail levels — compact (heading only) and
 * full (heading + diagnostics + stdout/stderr).
 */
export class StepIssueElement implements ReportElement {
  readonly id: string;
  readonly fixed = false;
  readonly levels = 2;

  private readonly issue: StepIssue;

  constructor(issue: StepIssue) {
    this.id = `issue-${issue.id}`;
    this.issue = issue;
  }

  size(format: OutputFormat, level: number): number {
    if (level === 0) {
      return renderIssueHeading(this.issue, format).length;
    }
    return renderFullIssue(this.issue, format).length;
  }

  render(format: OutputFormat, level: number): string {
    if (level === 0) {
      return renderIssueHeading(this.issue, format);
    }
    return renderFullIssue(this.issue, format);
  }
}

// ---------------------------------------------------------------------------
// Heading rendering
// ---------------------------------------------------------------------------

/** Render the step issue heading with code-styled step ID. */
function renderIssueHeading(issue: StepIssue, format: OutputFormat): string {
  const icon = issue.isFailed ? STATUS_FAILURE : DIAGNOSTIC_WARNING;
  const suffix = issueHeadingSuffix(issue);
  const stepId = issue.id;

  if (format === "markdown") {
    return `### ${icon} ${mdCodeSpan(stepId)}${markdownEscape(suffix)}\n\n`;
  }
  return `<h3>${icon} <code>${htmlEscape(stepId)}</code>${htmlEscape(suffix)}</h3>\n`;
}

/** Derive the heading suffix from the issue reason. */
function issueHeadingSuffix(issue: StepIssue): string {
  switch (issue.reason) {
    case "failed":
      return " failed";
    case "parse-error":
      return ": output could not be parsed";
    case "outcome":
      return issue.outcome !== undefined ? ` ${issue.outcome}` : "";
  }
}

// ---------------------------------------------------------------------------
// Full issue rendering
// ---------------------------------------------------------------------------

/** Render the full issue with heading + details. */
function renderFullIssue(issue: StepIssue, format: OutputFormat): string {
  let result = renderIssueHeading(issue, format);

  if (issue.exitCode !== undefined) {
    result += renderExitCode(issue.exitCode, format);
  }

  if (issue.diagnostic !== undefined) {
    result += new Blockquote(issue.diagnostic).render(format);
  }

  if (issue.stdout !== undefined) {
    const formatted = buildRawOutputRenderable(issue.stdout);
    result += new Details(detailsSummary("stdout"), formatted, true).render(
      format,
    );
  } else if (issue.stdoutError !== undefined) {
    result += renderWarningBlockquote(
      `${DIAGNOSTIC_WARNING} stdout not available: ${issue.stdoutError}`,
      format,
    );
  }

  if (issue.stderr !== undefined) {
    const formatted = buildRawOutputRenderable(issue.stderr);
    result += new Details(detailsSummary("stderr"), formatted, true).render(
      format,
    );
  } else if (issue.stderrError !== undefined) {
    result += renderWarningBlockquote(
      `${DIAGNOSTIC_WARNING} stderr not available: ${issue.stderrError}`,
      format,
    );
  }

  if (
    issue.stdout === undefined &&
    issue.stderr === undefined &&
    issue.stdoutError === undefined &&
    issue.stderrError === undefined
  ) {
    result += renderNoOutputNotice(format);
  }

  return result;
}

/** Renders an exit code paragraph. */
function renderExitCode(exitCode: string, format: OutputFormat): string {
  if (format === "markdown") {
    return `Exit code: ${mdCodeSpan(exitCode)}\n\n`;
  }
  return `<p>Exit code: <code>${htmlEscape(exitCode)}</code></p>\n`;
}

/** Renders a warning blockquote. */
function renderWarningBlockquote(text: string, format: OutputFormat): string {
  if (format === "markdown") {
    return `> ${markdownEscape(text)}\n\n`;
  }
  return `<blockquote><p>${htmlEscape(text)}</p></blockquote>\n`;
}

/** Renders a "no output captured" notice. */
function renderNoOutputNotice(format: OutputFormat): string {
  if (format === "markdown") {
    return "No output captured.\n\n";
  }
  return "<p>No output captured.</p>\n";
}
