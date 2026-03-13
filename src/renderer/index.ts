import type { Report } from "../model/report.js";
import type { RenderOptions } from "./options.js";
import type { DiffEntry } from "../diff/types.js";
import { MarkdownWriter } from "./writer.js";
import { renderSummary } from "./summary.js";
import { renderResource } from "./resource.js";
import { renderDiagnostics } from "./diagnostics.js";
import { renderApplyStatuses } from "./apply-status.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import { resolveTemplate } from "../template/index.js";
import { KNOWN_AFTER_APPLY, VALUE_NOT_IN_PLAN } from "../model/sentinels.js";

/**
 * Renders a Report model to a markdown string.
 * Automatically detects apply reports (those with diagnostics or applyStatuses)
 * and renders appropriate sections.
 */
export function renderReport(report: Report, options: RenderOptions = {}): string {
  const template = resolveTemplate(options.template ?? "default");
  const writer = new MarkdownWriter();
  const diffCache = new Map<string, DiffEntry[]>();
  const isApply = isApplyReport(report);
  const summaryHeading = isApply ? "Apply Summary" : "Plan Summary";

  if (options.title) {
    writer.heading(options.title, 2);
  }

  if (template.name === "summary") {
    writer.heading(summaryHeading, 2);
    renderSummary(report.summary, writer);
    if (isApply) {
      renderApplySections(report, writer);
    }
    return writer.build();
  }

  // Default template
  writer.heading(summaryHeading, 2);
  renderSummary(report.summary, writer);

  if (isApply) {
    renderApplySections(report, writer);
  }

  if (report.modules.length > 0 || report.outputs.length > 0) {
    writer.heading("Resource Changes", 2);

    for (const moduleGroup of report.modules) {
      const moduleLabel =
        moduleGroup.moduleAddress === ""
          ? "root"
          : `\`${moduleGroup.moduleAddress}\``;

      writer.heading(`📦 Module: ${moduleLabel}`, 3);

      for (const resource of moduleGroup.resources) {
        renderResource(resource, writer, options, diffCache);
      }

      if (moduleGroup.outputs.length > 0) {
        writer.heading("Outputs", 4);
        renderOutputTable(moduleGroup.outputs, writer);
      }
    }

    if (report.outputs.length > 0) {
      writer.heading("Outputs", 2);
      renderOutputTable(report.outputs, writer);
    }
  }

  return writer.build();
}

/** Returns true when the report was produced from an apply run. */
function isApplyReport(report: Report): boolean {
  return (
    report.diagnostics !== undefined || report.applyStatuses !== undefined
  );
}

/**
 * Renders the apply-specific sections: resource outcomes and diagnostics.
 */
function renderApplySections(report: Report, writer: MarkdownWriter): void {
  if (report.applyStatuses !== undefined && report.applyStatuses.length > 0) {
    renderApplyStatuses(report.applyStatuses, writer);
  }
  if (report.diagnostics !== undefined && report.diagnostics.length > 0) {
    writer.heading("Diagnostics", 2);
    renderDiagnostics(report.diagnostics, writer);
  }
}

function renderOutputTable(
  outputs: Report["outputs"],
  writer: MarkdownWriter,
): void {
  writer.tableHeader(["Output", "Action", "Before", "After"]);
  for (const output of outputs) {
    const symbol = ACTION_SYMBOLS[output.action];
    const before = output.isSensitive
      ? MarkdownWriter.inlineCode("(sensitive)")
      : output.before !== null
        ? MarkdownWriter.inlineCode(MarkdownWriter.escapeCell(output.before))
        : "";
    const after = output.isSensitive
      ? MarkdownWriter.inlineCode("(sensitive)")
      : output.after === KNOWN_AFTER_APPLY
        ? `_${KNOWN_AFTER_APPLY}_`
        : output.after === VALUE_NOT_IN_PLAN
          ? `_${VALUE_NOT_IN_PLAN}_`
          : output.after !== null
            ? MarkdownWriter.inlineCode(MarkdownWriter.escapeCell(output.after))
            : "";
    writer.tableRow([
      MarkdownWriter.escapeCell(output.name),
      symbol,
      before,
      after,
    ]);
  }
  writer.blankLine();
}
