/**
 * Step issue element — renders a step failure or warning with collapsible
 * stdout/stderr content.
 *
 * Has 2 levels:
 * - Level 0 (compact): heading only
 * - Level 1 (full): heading + exit code + diagnostic + stdout/stderr
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import type { ReportElement } from "../renderable/types.js";
import type { StepIssue } from "../model/step-issue.js";
import {
  Paragraph,
  Blockquote,
  Details,
  Sequence,
  RawText,
} from "../renderable/primitives.js";
import { htmlEscape } from "../renderable/html-escape.js";
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
    return `### ${icon} \`${stepId}\`${suffix}\n\n`;
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
  const heading = renderIssueHeading(issue, format);
  const parts: Renderable[] = [];

  if (issue.exitCode !== undefined) {
    parts.push(new ExitCodeParagraph(issue.exitCode));
  }

  if (issue.diagnostic !== undefined) {
    parts.push(new Blockquote(issue.diagnostic));
  }

  if (issue.stdout !== undefined) {
    const formatted = buildRawOutputRenderable(issue.stdout);
    parts.push(new Details(new RawText("stdout"), formatted, true));
  } else if (issue.stdoutError !== undefined) {
    parts.push(
      new WarningBlockquote(
        `${DIAGNOSTIC_WARNING} stdout not available: ${issue.stdoutError}`,
      ),
    );
  }

  if (issue.stderr !== undefined) {
    const formatted = buildRawOutputRenderable(issue.stderr);
    parts.push(new Details(new RawText("stderr"), formatted, true));
  } else if (issue.stderrError !== undefined) {
    parts.push(
      new WarningBlockquote(
        `${DIAGNOSTIC_WARNING} stderr not available: ${issue.stderrError}`,
      ),
    );
  }

  if (
    issue.stdout === undefined &&
    issue.stderr === undefined &&
    issue.stdoutError === undefined &&
    issue.stderrError === undefined
  ) {
    parts.push(new Paragraph("No output captured."));
  }

  const body = new Sequence(parts);
  return heading + body.render(format);
}

/** Exit code paragraph. */
class ExitCodeParagraph implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(exitCode: string) {
    this.mdStr = `Exit code: \`${exitCode}\`\n\n`;
    this.htStr = `<p>Exit code: <code>${exitCode}</code></p>\n`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
  }
}

/** Warning blockquote. */
class WarningBlockquote implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(text: string) {
    this.mdStr = `> ${text}\n\n`;
    this.htStr = `<blockquote><p>${text}</p></blockquote>\n`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
  }
}
