/**
 * Diagnostics element — renders errors and warnings as a fixed
 * ReportElement with headings and formatted diagnostic details.
 */

import type { OutputFormat } from "../renderable/types.js";
import type { ReportElement } from "../renderable/types.js";
import type { Diagnostic } from "../model/diagnostic.js";
import type { UIDiagnosticSnippet } from "../model/index.js";
import { Blockquote } from "../renderable/primitives.js";
import { DIAGNOSTIC_ERROR, DIAGNOSTIC_WARNING } from "../model/status-icons.js";
import { htmlEscape } from "../renderable/html-escape.js";
import { markdownEscape } from "../renderable/markdown-escape.js";
import { mdCodeSpan } from "../renderable/helpers.js";

/**
 * A diagnostics section with error/warning sub-headings.
 * Always fixed — never degraded by the composer.
 */
export class DiagnosticsElement implements ReportElement {
  readonly id: string;
  readonly fixed = true;
  readonly levels = 1;

  private readonly diagnostics: readonly Diagnostic[];
  private readonly headingLevel: 2 | 3;

  constructor(
    id: string,
    diagnostics: readonly Diagnostic[],
    headingLevel: 2 | 3 = 3,
  ) {
    this.id = id;
    this.diagnostics = diagnostics;
    this.headingLevel = headingLevel;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat, _level: number): number {
    return this.render(format, 0).length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat, _level: number): string {
    return renderDiagnostics(this.diagnostics, this.headingLevel, format);
  }
}

/** Renders the diagnostics directly to a string. */
function renderDiagnostics(
  diagnostics: readonly Diagnostic[],
  headingLevel: 2 | 3,
  format: OutputFormat,
): string {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  let result = "";

  if (errors.length > 0) {
    result += renderPlainHeading("Errors", headingLevel, format);
    for (const diag of errors) {
      result += renderDiagnostic(diag, format);
    }
  }

  if (warnings.length > 0) {
    result += renderPlainHeading("Warnings", headingLevel, format);
    for (const diag of warnings) {
      result += renderDiagnostic(diag, format);
    }
  }

  return result;
}

/** Renders a single diagnostic to a string. */
function renderDiagnostic(diag: Diagnostic, format: OutputFormat): string {
  let result = renderDiagnosticSummaryLine(
    diag.severity,
    diag.summary,
    diag.address,
    format,
  );

  if (diag.detail) {
    result += new Blockquote(diag.detail).render(format);
  }

  if (diag.snippet !== undefined) {
    result += renderSnippet(diag.snippet, diag.range?.filename, format);
  }

  // Add spacing after blockquote groups to prevent CommonMark lazy continuation
  if (diag.detail || diag.snippet !== undefined) {
    if (format === "markdown") result += "\n";
  }

  return result;
}

/** Renders a snippet section. */
function renderSnippet(
  snippet: UIDiagnosticSnippet,
  filename: string | undefined,
  format: OutputFormat,
): string {
  let result = renderSnippetLine(
    snippet.code,
    snippet.context,
    filename,
    snippet.start_line,
    format,
  );

  for (const val of snippet.values) {
    result += renderSnippetValue(val.traversal, val.statement, format);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/** Renders a plain heading. */
function renderPlainHeading(
  text: string,
  level: 2 | 3,
  format: OutputFormat,
): string {
  if (format === "markdown") {
    return `${"#".repeat(level)} ${markdownEscape(text)}\n\n`;
  }
  return `<h${String(level)}>${htmlEscape(text)}</h${String(level)}>\n`;
}

/** Renders a diagnostic summary line with icon and optional address. */
function renderDiagnosticSummaryLine(
  severity: "error" | "warning",
  summary: string,
  address: string | undefined,
  format: OutputFormat,
): string {
  const icon = severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
  if (format === "markdown") {
    const addr = address !== undefined ? ` — ${mdCodeSpan(address)}` : "";
    return `${icon} **${markdownEscape(summary)}**${addr}\n\n`;
  }
  const addr =
    address !== undefined ? ` — <code>${htmlEscape(address)}</code>` : "";
  return `<p>${icon} <strong>${htmlEscape(summary)}</strong>${addr}</p>\n`;
}

/** Renders a snippet location line. */
function renderSnippetLine(
  code: string,
  context: string,
  filename: string | undefined,
  startLine: number,
  format: OutputFormat,
): string {
  if (format === "markdown") {
    const loc =
      filename !== undefined
        ? `${mdCodeSpan(code)} in ${markdownEscape(context)} (${mdCodeSpan(filename)}:${String(startLine)})`
        : `${mdCodeSpan(code)} in ${markdownEscape(context)}`;
    return `> ${loc}\n\n`;
  }
  const loc =
    filename !== undefined
      ? `<code>${htmlEscape(code)}</code> in ${htmlEscape(context)} (<code>${htmlEscape(filename)}</code>:${String(startLine)})`
      : `<code>${htmlEscape(code)}</code> in ${htmlEscape(context)}`;
  return `<blockquote><p>${loc}</p></blockquote>\n`;
}

/** Renders a snippet value expression. */
function renderSnippetValue(
  traversal: string,
  statement: string,
  format: OutputFormat,
): string {
  if (format === "markdown") {
    return `> ${markdownEscape(traversal)} = ${markdownEscape(statement)}\n\n`;
  }
  return `<blockquote><p>${htmlEscape(traversal)} = ${htmlEscape(statement)}</p></blockquote>\n`;
}
