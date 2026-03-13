import type { Diagnostic } from "../model/diagnostic.js";
import type { MarkdownWriter } from "./writer.js";
import { DIAGNOSTIC_ERROR, DIAGNOSTIC_WARNING } from "../model/status-icons.js";

/**
 * Renders diagnostics (errors and warnings) as a markdown section.
 * Errors are shown before warnings. Each diagnostic is rendered with
 * its summary, optional address, and detail text.
 */
export function renderDiagnostics(
  diagnostics: readonly Diagnostic[],
  writer: MarkdownWriter,
): void {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");

  if (errors.length > 0) {
    writer.heading("Errors", 3);
    for (const diag of errors) {
      renderDiagnostic(diag, writer);
    }
  }

  if (warnings.length > 0) {
    writer.heading("Warnings", 3);
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
