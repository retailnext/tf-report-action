/**
 * Title, marker, and warning elements — fixed sections always rendered
 * at full detail and never degraded by the progressive composer.
 */

import type { Renderable, OutputFormat } from "../model/renderable.js";
import type { ReportElement } from "../renderable/types.js";
import type { ReportTitle, TitleActionCount } from "../model/report-title.js";
import { Heading } from "../renderable/primitives.js";
import { htmlEscape } from "../renderable/html-escape.js";
import { markdownEscape } from "../renderable/markdown-escape.js";
import {
  STATUS_SUCCESS,
  STATUS_FAILURE,
  DIAGNOSTIC_WARNING,
} from "../model/status-icons.js";

/**
 * The report title rendered as an H2 heading from structured title data.
 * Always fixed (never degraded by the composer).
 */
export class TitleElement implements ReportElement {
  readonly id = "title";
  readonly fixed = true;
  readonly levels = 1;

  private readonly title: ReportTitle;

  constructor(title: ReportTitle) {
    this.title = title;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat, _level: number): number {
    return renderTitle(this.title, format).length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat, _level: number): string {
    return renderTitle(this.title, format);
  }
}

// ---------------------------------------------------------------------------
// Title rendering
// ---------------------------------------------------------------------------

/** Render a structured title to the given format. */
function renderTitle(title: ReportTitle, format: OutputFormat): string {
  const icon = statusIcon(title.status);
  const ws = renderWorkspace(title.workspace, format);
  const bodyText = renderTitleBody(title.body, format);
  const content = [icon, ws, bodyText].filter(Boolean).join(" ");

  if (format === "markdown") {
    return `## ${content}\n\n`;
  }
  return `<h2>${content}</h2>\n`;
}

/** Render workspace as code-styled text, or empty string if none. */
function renderWorkspace(
  workspace: string | undefined,
  format: OutputFormat,
): string {
  if (workspace === undefined) return "";
  if (format === "markdown") {
    return `\`${workspace}\``;
  }
  return `<code>${htmlEscape(workspace)}</code>`;
}

/** Render the title body text. */
function renderTitleBody(
  body: ReportTitle["body"],
  format: OutputFormat,
): string {
  switch (body.kind) {
    case "summary":
      return renderSummaryBody(body);
    case "no-changes":
      return "No Changes";
    case "error":
      return "Report Generation Failed";
    case "operation-failed":
      return `${operationLabel(body.operation)} Failed`;
    case "step-failed":
      return renderStepFailed(body.stepId, format);
    case "generic-failed":
      return "Failed";
    case "operation-skipped":
      return body.operation !== undefined
        ? `${operationLabel(body.operation)} Skipped`
        : "Skipped";
    case "all-skipped":
      return "All Steps Skipped";
    case "succeeded":
      return body.operation !== undefined
        ? `${operationLabel(body.operation)} Succeeded`
        : "Succeeded";
  }
}

/** Render step-failed body with code-styled step ID. */
function renderStepFailed(stepId: string, format: OutputFormat): string {
  if (format === "markdown") {
    return `\`${stepId}\` Failed`;
  }
  return `<code>${htmlEscape(stepId)}</code> Failed`;
}

/** Render summary body (plan/apply with counts). */
function renderSummaryBody(
  body: Extract<ReportTitle["body"], { kind: "summary" }>,
): string {
  const isApply = body.operation === "apply" || body.operation === "destroy";

  if (isApply) {
    if (body.failureTotal > 0) {
      const failParts = formatFailureParts(body.failures);
      const countParts = formatApplyCountParts(body.counts);
      return `Apply Failed: ${[...failParts, ...countParts].join(", ")}`;
    }
    const parts = formatApplyCountParts(body.counts);
    appendOutputChangesPart(parts, body.outputChanges);
    if (parts.length === 0) {
      return "Apply Complete";
    }
    return `Apply: ${parts.join(", ")}`;
  }

  // Plan
  const parts = formatPlanCountParts(body.counts);
  appendOutputChangesPart(parts, body.outputChanges);
  return `Plan: ${parts.join(", ")}`;
}

/** Append an "N output change(s)" part when there are output changes. */
function appendOutputChangesPart(parts: string[], outputChanges: number): void {
  if (outputChanges <= 0) return;
  const noun = outputChanges === 1 ? "output change" : "output changes";
  parts.push(`${String(outputChanges)} ${noun}`);
}

// ---------------------------------------------------------------------------
// Count formatting (rendering concern — lives in element layer)
// ---------------------------------------------------------------------------

/** Format plan action counts as human-readable strings. */
function formatPlanCountParts(counts: readonly TitleActionCount[]): string[] {
  return counts.map(
    (c) => `${String(c.count)} to ${planActionLabel(c.action)}`,
  );
}

/** Format apply action counts as human-readable strings. */
function formatApplyCountParts(counts: readonly TitleActionCount[]): string[] {
  return counts.map((c) => `${String(c.count)} ${applyActionLabel(c.action)}`);
}

/** Format failure counts as human-readable strings. */
function formatFailureParts(failures: readonly TitleActionCount[]): string[] {
  return failures.map((f) => `${String(f.count)} ${f.action}`);
}

function planActionLabel(action: string): string {
  switch (action) {
    case "create":
      return "add";
    case "update":
      return "change";
    case "delete":
      return "destroy";
    case "replace":
      return "replace";
    case "import":
      return "import";
    case "move":
      return "move";
    case "forget":
      return "forget";
    default:
      return action;
  }
}

function applyActionLabel(action: string): string {
  switch (action) {
    case "create":
      return "added";
    case "update":
      return "changed";
    case "delete":
      return "destroyed";
    case "replace":
      return "replaced";
    case "import":
      return "imported";
    case "move":
      return "moved";
    case "forget":
      return "forgotten";
    default:
      return action;
  }
}

/** Returns a human-readable operation label. */
function operationLabel(operation: string): string {
  switch (operation) {
    case "apply":
      return "Apply";
    case "destroy":
      return "Destroy";
    case "plan":
      return "Plan";
    default:
      return operation;
  }
}

/** Map a title status to the appropriate emoji. */
function statusIcon(status: ReportTitle["status"]): string {
  switch (status) {
    case "success":
      return STATUS_SUCCESS;
    case "failure":
      return STATUS_FAILURE;
    case "warning":
      return DIAGNOSTIC_WARNING;
  }
}

/**
 * Workspace dedup marker — an HTML comment used by the Action to find
 * and update existing comments. Always fixed, zero visual size.
 */
export class MarkerElement implements ReportElement {
  readonly id = "marker";
  readonly fixed = true;
  readonly levels = 1;

  private readonly workspace: string;

  constructor(workspace: string) {
    this.workspace = workspace;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(_format: OutputFormat, _level: number): number {
    return this.render("markdown", 0).length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format: OutputFormat, _level: number): string {
    const escaped = escapeMarkerWorkspace(this.workspace);
    return `<!-- tf-report-action:"${escaped}" -->\n`;
  }
}

/**
 * A warning banner rendered as a blockquote with the warning icon.
 * Always fixed (never degraded).
 */
export class WarningElement implements ReportElement {
  readonly fixed = true;
  readonly levels = 1;

  readonly id: string;
  private readonly renderable: Renderable;

  constructor(warning: Renderable, index: number) {
    this.id = `warning-${String(index)}`;
    this.renderable = new WarningBlockquoteChrome(warning);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat, _level: number): number {
    return this.renderable.size(format);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat, _level: number): string {
    return this.renderable.render(format);
  }
}

/**
 * A user-provided title heading (used by library API, not reportFromSteps).
 * Always fixed.
 */
export class UserTitleElement implements ReportElement {
  readonly id = "user-title";
  readonly fixed = true;
  readonly levels = 1;

  private readonly renderable: Renderable;

  constructor(title: string) {
    this.renderable = new Heading(title, 2);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat, _level: number): number {
    return this.renderable.size(format);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat, _level: number): string {
    return this.renderable.render(format);
  }
}

/**
 * A logs URL notice at the end of the report.
 * Always fixed.
 */
export class LogsUrlElement implements ReportElement {
  readonly id = "logs-url";
  readonly fixed = true;
  readonly levels = 1;

  private readonly renderable: Renderable;

  constructor(url: string) {
    this.renderable = new LogsUrlRenderable(url);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat, _level: number): number {
    return this.renderable.size(format);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat, _level: number): string {
    return this.renderable.render(format);
  }
}

// ---------------------------------------------------------------------------
// Internal renderables
// ---------------------------------------------------------------------------

/**
 * Adds blockquote chrome around a warning body Renderable.
 *
 * Produces `> ⚠️ **Warning:** {body}\n\n` in markdown and
 * `<blockquote><p>⚠️ <strong>Warning:</strong> {body}</p></blockquote>\n` in HTML.
 *
 * The body is a Renderable that produces its own format-appropriate text.
 */
class WarningBlockquoteChrome implements Renderable {
  private readonly body: Renderable;

  constructor(body: Renderable) {
    this.body = body;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    const text = this.body.render(format);
    if (format === "markdown") {
      return `> ${DIAGNOSTIC_WARNING} **Warning:** ${text}\n\n`;
    }
    return `<blockquote><p>${DIAGNOSTIC_WARNING} <strong>Warning:</strong> ${text}</p></blockquote>\n`;
  }
}

/** Renders a logs link. */
class LogsUrlRenderable implements Renderable {
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    if (format === "markdown") {
      return `[View full logs](${markdownEscape(this.url)})\n\n`;
    }
    return `<p><a href="${htmlEscape(this.url)}">View full logs</a></p>\n`;
  }
}

/**
 * Escape workspace name for safe HTML comment embedding.
 *
 * HTML comments are terminated by `-->` (or `--!>`). Backslash escaping
 * has no special meaning inside HTML comments, so we insert a zero-width
 * space between consecutive dashes to break `--` sequences and prevent
 * premature comment termination.
 */
function escapeMarkerWorkspace(workspace: string): string {
  return workspace
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/--/g, "-\u200B-");
}
