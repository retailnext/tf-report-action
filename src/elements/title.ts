/**
 * Title, marker, and warning elements — fixed sections always rendered
 * at full detail and never degraded by the progressive composer.
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import type { ReportElement } from "../renderable/types.js";
import type { ReportTitle, TitleActionCount } from "../model/report-title.js";
import { Heading, HtmlText } from "../renderable/primitives.js";
import { htmlEscape } from "../renderable/html-escape.js";
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
    if (parts.length === 0) {
      return "Apply Complete";
    }
    return `Apply: ${parts.join(", ")}`;
  }

  // Plan
  const parts = formatPlanCountParts(body.counts);
  return `Plan: ${parts.join(", ")}`;
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

  private readonly renderable: Renderable;

  constructor(workspace: string) {
    const escaped = escapeMarkerWorkspace(workspace);
    const comment = `<!-- tf-report-action:"${escaped}" -->\n`;
    this.renderable = new HtmlText(comment);
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
 * A warning banner rendered as a blockquote with the warning icon.
 * Always fixed (never degraded).
 */
export class WarningElement implements ReportElement {
  readonly fixed = true;
  readonly levels = 1;

  readonly id: string;
  private readonly renderable: Renderable;

  constructor(warning: string, index: number) {
    this.id = `warning-${String(index)}`;
    // The warning text may contain markdown/HTML — render as-is in
    // markdown, but escape for HTML format. Use format-aware rendering.
    this.renderable = new WarningRenderable(warning);
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
 * Warning renderable that produces `> ⚠️ **Warning:** text\n\n` in
 * markdown and `<blockquote><p>⚠️ <strong>Warning:</strong> text</p></blockquote>\n`
 * in HTML.
 */
class WarningRenderable implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(warning: string) {
    this.mdStr = `> ${DIAGNOSTIC_WARNING} **Warning:** ${warning}\n\n`;
    this.htStr = `<blockquote><p>${DIAGNOSTIC_WARNING} <strong>Warning:</strong> ${htmlEscape(warning)}</p></blockquote>\n`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
  }
}

/** Renders a logs link. */
class LogsUrlRenderable implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(url: string) {
    this.mdStr = `[View full logs](${url})\n\n`;
    this.htStr = `<p><a href="${htmlEscape(url)}">View full logs</a></p>\n`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
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
