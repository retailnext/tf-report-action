/**
 * Diagnostics element — renders errors and warnings as a fixed
 * ReportElement with headings and formatted diagnostic details.
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import type { ReportElement } from "../renderable/types.js";
import type { Diagnostic } from "../model/diagnostic.js";
import type { UIDiagnosticSnippet } from "../model/index.js";
import {
  Heading,
  Blockquote,
  Sequence,
  EMPTY,
} from "../renderable/primitives.js";
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
    parts.push(new Heading("Errors", headingLevel));
    for (const diag of errors) {
      parts.push(buildDiagnosticRenderable(diag));
    }
  }

  if (warnings.length > 0) {
    parts.push(new Heading("Warnings", headingLevel));
    for (const diag of warnings) {
      parts.push(buildDiagnosticRenderable(diag));
    }
  }

  if (parts.length === 0) return EMPTY;
  return new Sequence(parts);
}

/** Builds a single diagnostic as a Renderable. */
function buildDiagnosticRenderable(diag: Diagnostic): Renderable {
  const prefix =
    diag.severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
  const addressSuffix =
    diag.address !== undefined ? ` — \`${diag.address}\`` : "";

  const parts: Renderable[] = [];
  parts.push(
    new DiagnosticSummary(
      `${prefix} **${htmlEscape(diag.summary)}**${addressSuffix}`,
    ),
  );

  if (diag.detail) {
    parts.push(new Blockquote(htmlEscape(diag.detail)));
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

  const location =
    filename !== undefined
      ? `\`${snippet.code}\` in ${htmlEscape(snippet.context)} (\`${filename}\`:${String(snippet.start_line)})`
      : `\`${snippet.code}\` in ${htmlEscape(snippet.context)}`;
  parts.push(new Blockquote(location));

  if (snippet.values.length > 0) {
    for (const val of snippet.values) {
      parts.push(
        new Blockquote(
          `${htmlEscape(val.traversal)} = ${htmlEscape(val.statement)}`,
        ),
      );
    }
  }

  return new Sequence(parts);
}

/**
 * A diagnostic summary line (paragraph with formatted text).
 * In markdown: `text\n\n`, in HTML: `<p>text</p>\n`.
 * The text may contain markdown formatting (bold, backticks) that
 * should pass through in markdown but be treated as-is in HTML.
 */
class DiagnosticSummary implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(text: string) {
    this.mdStr = `${text}\n\n`;
    // Keep the text as-is for HTML — it contains intentional HTML entities
    // and markdown formatting that renders in both contexts
    this.htStr = `<p>${text}</p>\n`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
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
