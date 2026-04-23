/**
 * Diagnostics element — renders errors and warnings as a fixed
 * ReportElement with headings and formatted diagnostic details.
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import type { ReportElement } from "../renderable/types.js";
import type { Diagnostic } from "../model/diagnostic.js";
import type { UIDiagnosticSnippet } from "../model/index.js";
import { Blockquote, Sequence, EMPTY } from "../renderable/primitives.js";
import { DIAGNOSTIC_ERROR, DIAGNOSTIC_WARNING } from "../model/status-icons.js";
import { htmlEscape } from "../renderable/html-escape.js";

/**
 * A diagnostics section with error/warning sub-headings.
 * Always fixed — never degraded by the composer.
 */
export class DiagnosticsElement implements ReportElement {
  readonly id: string;
  readonly fixed = true;
  readonly levels = 1;

  private readonly renderable: Renderable;

  constructor(
    id: string,
    diagnostics: readonly Diagnostic[],
    headingLevel: 2 | 3 = 3,
  ) {
    this.id = id;
    this.renderable = buildDiagnosticsRenderable(diagnostics, headingLevel);
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

/** Builds the diagnostics as a Renderable tree. */
function buildDiagnosticsRenderable(
  diagnostics: readonly Diagnostic[],
  headingLevel: 2 | 3,
): Renderable {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const parts: Renderable[] = [];

  if (errors.length > 0) {
    parts.push(new PlainHeading("Errors", headingLevel));
    for (const diag of errors) {
      parts.push(buildDiagnosticRenderable(diag));
    }
  }

  if (warnings.length > 0) {
    parts.push(new PlainHeading("Warnings", headingLevel));
    for (const diag of warnings) {
      parts.push(buildDiagnosticRenderable(diag));
    }
  }

  if (parts.length === 0) return EMPTY;
  return new Sequence(parts);
}

/** Builds a single diagnostic as a Renderable. */
function buildDiagnosticRenderable(diag: Diagnostic): Renderable {
  const parts: Renderable[] = [];
  parts.push(
    new DiagnosticSummaryLine(diag.severity, diag.summary, diag.address),
  );

  if (diag.detail) {
    parts.push(new Blockquote(diag.detail));
  }

  if (diag.snippet !== undefined) {
    parts.push(buildSnippetRenderable(diag.snippet, diag.range?.filename));
  }

  // Add spacing after blockquote groups to prevent CommonMark lazy continuation
  if (diag.detail || diag.snippet !== undefined) {
    parts.push(new BlankLine());
  }

  return new Sequence(parts);
}

/** Builds a snippet renderable. */
function buildSnippetRenderable(
  snippet: UIDiagnosticSnippet,
  filename: string | undefined,
): Renderable {
  const parts: Renderable[] = [];

  parts.push(
    new DiagnosticSnippetLine(
      snippet.code,
      snippet.context,
      filename,
      snippet.start_line,
    ),
  );

  if (snippet.values.length > 0) {
    for (const val of snippet.values) {
      parts.push(new DiagnosticSnippetValue(val.traversal, val.statement));
    }
  }

  return new Sequence(parts);
}

// ---------------------------------------------------------------------------
// Internal Renderables
// ---------------------------------------------------------------------------

/** A plain heading (no embedded formatting). */
class PlainHeading implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(text: string, level: 2 | 3) {
    this.mdStr = `${"#".repeat(level)} ${text}\n\n`;
    this.htStr = `<h${String(level)}>${htmlEscape(text)}</h${String(level)}>\n`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
  }
}

/**
 * Diagnostic summary line — holds severity, summary text, and optional
 * resource address as semantic data.
 */
class DiagnosticSummaryLine implements Renderable {
  private readonly severity: "error" | "warning";
  private readonly summary: string;
  private readonly address: string | undefined;

  constructor(
    severity: "error" | "warning",
    summary: string,
    address?: string,
  ) {
    this.severity = severity;
    this.summary = summary;
    this.address = address;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    const icon =
      this.severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
    if (format === "markdown") {
      const addr = this.address !== undefined ? ` — \`${this.address}\`` : "";
      return `${icon} **${this.summary}**${addr}\n\n`;
    }
    const addr =
      this.address !== undefined
        ? ` — <code>${htmlEscape(this.address)}</code>`
        : "";
    return `<p>${icon} <strong>${htmlEscape(this.summary)}</strong>${addr}</p>\n`;
  }
}

/**
 * Diagnostic snippet location line — holds code symbol, context, and
 * optional filename/line as semantic data.
 */
class DiagnosticSnippetLine implements Renderable {
  private readonly code: string;
  private readonly context: string;
  private readonly filename: string | undefined;
  private readonly startLine: number;

  constructor(
    code: string,
    context: string,
    filename: string | undefined,
    startLine: number,
  ) {
    this.code = code;
    this.context = context;
    this.filename = filename;
    this.startLine = startLine;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    if (format === "markdown") {
      const loc =
        this.filename !== undefined
          ? `\`${this.code}\` in ${this.context} (\`${this.filename}\`:${String(this.startLine)})`
          : `\`${this.code}\` in ${this.context}`;
      return `> ${loc}\n\n`;
    }
    const loc =
      this.filename !== undefined
        ? `<code>${htmlEscape(this.code)}</code> in ${htmlEscape(this.context)} (<code>${htmlEscape(this.filename)}</code>:${String(this.startLine)})`
        : `<code>${htmlEscape(this.code)}</code> in ${htmlEscape(this.context)}`;
    return `<blockquote><p>${loc}</p></blockquote>\n`;
  }
}

/**
 * Diagnostic snippet value — holds a traversal expression and its
 * evaluated statement as semantic data.
 */
class DiagnosticSnippetValue implements Renderable {
  private readonly traversal: string;
  private readonly statement: string;

  constructor(traversal: string, statement: string) {
    this.traversal = traversal;
    this.statement = statement;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    if (format === "markdown") {
      return `> ${this.traversal} = ${this.statement}\n\n`;
    }
    return `<blockquote><p>${htmlEscape(this.traversal)} = ${htmlEscape(this.statement)}</p></blockquote>\n`;
  }
}

/** A blank line separator. */
class BlankLine implements Renderable {
  size(format: OutputFormat): number {
    return format === "markdown" ? 1 : 0;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? "\n" : "";
  }
}
