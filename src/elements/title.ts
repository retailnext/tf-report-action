/**
 * Title, marker, and warning elements — fixed sections always rendered
 * at full detail and never degraded by the progressive composer.
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import type { ReportElement } from "../renderable/types.js";
import { Heading, HtmlText } from "../renderable/primitives.js";
import { htmlEscape } from "../renderable/html-escape.js";
import { DIAGNOSTIC_WARNING } from "../model/status-icons.js";

/**
 * The report title rendered as an H2 heading.
 * Always fixed (never degraded by the composer).
 */
export class TitleElement implements ReportElement {
  readonly id = "title";
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
