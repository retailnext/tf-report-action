import type { Diagnostic } from "../model/diagnostic.js";
import type { MarkdownWriter } from "./writer.js";
import { DIAGNOSTIC_ERROR, DIAGNOSTIC_WARNING } from "../model/status-icons.js";

/**
 * Renders diagnostics (errors and warnings) as a markdown section.
 * Errors are shown before warnings. Each diagnostic is rendered with
 * its summary, optional address, and detail text.
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
  const prefix = diag.severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
  const addressSuffix =
    diag.address !== undefined ? ` — \`${diag.address}\`` : "";
  writer.paragraph(`${prefix} **${diag.summary}**${addressSuffix}`);
  if (diag.detail) {
    writer.codeFence(diag.detail);
  }
}
