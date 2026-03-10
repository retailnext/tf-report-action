import type { Report } from "../model/report.js";
import type { RenderOptions } from "./options.js";
import type { DiffEntry } from "../diff/types.js";
import { MarkdownWriter } from "./writer.js";
import { renderSummary } from "./summary.js";
import { renderResource } from "./resource.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import { resolveTemplate } from "../template/index.js";

/**
 * Renders a Report model to a markdown string.
 */
export function renderReport(report: Report, options: RenderOptions = {}): string {
  const template = resolveTemplate(options.template ?? "default");
  const writer = new MarkdownWriter();
  const diffCache = new Map<string, DiffEntry[]>();

  if (options.title) {
    writer.heading(options.title, 2);
  }

  if (template.name === "summary") {
    writer.heading("Plan Summary", 2);
    renderSummary(report.summary, writer);
    return writer.build();
  }

  // Default template
  writer.heading("Plan Summary", 2);
  renderSummary(report.summary, writer);

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
