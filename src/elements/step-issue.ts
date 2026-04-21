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
  Heading,
  Paragraph,
  Blockquote,
  Details,
  Sequence,
  RawText,
} from "../renderable/primitives.js";
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

  private readonly compact: Renderable;
  private readonly full: Renderable;

  constructor(issue: StepIssue) {
    this.id = `issue-${issue.id}`;
    const icon = issue.isFailed ? STATUS_FAILURE : DIAGNOSTIC_WARNING;
    const headingRenderable = new Heading(`${icon} ${issue.heading}`, 3);

    this.compact = headingRenderable;
    this.full = buildFullIssue(issue, icon, headingRenderable);
  }

  size(format: OutputFormat, level: number): number {
    const r = level === 0 ? this.compact : this.full;
    return r.size(format);
  }

  render(format: OutputFormat, level: number): string {
    const r = level === 0 ? this.compact : this.full;
    return r.render(format);
  }
}

/** Builds the full issue renderable with all details. */
function buildFullIssue(
  issue: StepIssue,
  icon: string,
  headingRenderable: Renderable,
): Renderable {
  const parts: Renderable[] = [headingRenderable];

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

  return new Sequence(parts);
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
