import type { Diagnostic } from "../model/diagnostic.js";
import type { UIDiagnosticSnippet } from "../model/index.js";
import type { MarkdownWriter } from "./writer.js";
import { DIAGNOSTIC_ERROR, DIAGNOSTIC_WARNING } from "../model/status-icons.js";
import { escapeHtml } from "../raw-formatter/jsonl.js";

/**
 * Renders diagnostics (errors and warnings) as a markdown section.
 * Errors are shown before warnings. Each diagnostic is rendered with
 * its summary, optional address, detail text, source location, and
 * HCL code snippet when available.
 *
 * @param headingLevel - Heading level for "Errors" / "Warnings" sub-headings.
 *                       Use 2 for top-level sections, 3 for nested sections.
 */
export function renderDiagnostics(
  diagnostics: readonly Diagnostic[],
  writer: MarkdownWriter,
  headingLevel: 2 | 3 = 3,
): void {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");

  if (errors.length > 0) {
    writer.heading("Errors", headingLevel);
    for (const diag of errors) {
      renderDiagnostic(diag, writer);
    }
  }

  if (warnings.length > 0) {
    writer.heading("Warnings", headingLevel);
    for (const diag of warnings) {
      renderDiagnostic(diag, writer);
    }
  }
}

function renderDiagnostic(diag: Diagnostic, writer: MarkdownWriter): void {
  const prefix =
    diag.severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
  const addressSuffix =
    diag.address !== undefined ? ` — \`${diag.address}\`` : "";
  writer.paragraph(`${prefix} **${escapeHtml(diag.summary)}**${addressSuffix}`);

  if (diag.detail) {
    writer.blockquote(escapeHtml(diag.detail));
  }

  if (diag.snippet !== undefined) {
    renderSnippet(diag.snippet, diag.range?.filename, writer);
  }

  // Blank line after blockquote group prevents CommonMark lazy continuation
  // from absorbing subsequent content into the blockquote.
  if (diag.detail || diag.snippet !== undefined) {
    writer.blankLine();
  }
}

/**
 * Render an HCL source snippet with context and highlighted code.
 *
 * Produces a blockquote containing the context label, the code line with
 * an inline code format showing the file:line reference, and expression
 * values if any are provided.
 */
function renderSnippet(
  snippet: UIDiagnosticSnippet,
  filename: string | undefined,
  writer: MarkdownWriter,
): void {
  const location =
    filename !== undefined
      ? `\`${snippet.code}\` in ${escapeHtml(snippet.context)} (\`${filename}\`:${String(snippet.start_line)})`
      : `\`${snippet.code}\` in ${escapeHtml(snippet.context)}`;
  writer.blockquote(location);

  if (snippet.values.length > 0) {
    for (const val of snippet.values) {
      writer.blockquote(
        `${escapeHtml(val.traversal)} = ${escapeHtml(val.statement)}`,
      );
    }
  }
}
