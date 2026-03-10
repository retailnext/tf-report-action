/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

import type { ResourceChange } from "../model/resource.js";
import { MarkdownWriter } from "./writer.js";
import type { RenderOptions } from "./options.js";
import type { DiffEntry } from "../diff/types.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import { formatDiff } from "./diff-format.js";
import { renderLargeValue } from "./large-value.js";

/**
 * Renders a single resource change as a collapsible details block.
 */
export function renderResource(
  resource: ResourceChange,
  writer: MarkdownWriter,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
): void {
  const symbol = ACTION_SYMBOLS[resource.action];
  const diffFormat = options.diffFormat ?? "inline";

  // Build summary text
  const changedAttrs = resource.attributes
    .filter((a) => !a.isSensitive && a.before !== a.after)
    .map((a) => a.name);

  let summaryText = `${symbol} <strong>${MarkdownWriter.escapeCell(resource.type)}</strong> ${MarkdownWriter.escapeCell(resource.name)}`;

  if (resource.action === "update" && changedAttrs.length > 0) {
    const hint = changedAttrs.slice(0, 5).join(", ");
    summaryText += ` — changed: ${MarkdownWriter.escapeCell(hint)}`;
  }

  writer.detailsOpen(summaryText);

  // Show import/moved-from metadata
  if (resource.importId !== null) {
    writer.paragraph(`**Import ID:** \`${resource.importId}\``);
  }
  if (resource.movedFromAddress !== null) {
    writer.paragraph(`**Moved from:** \`${resource.movedFromAddress}\``);
  }

  // Separate small and large attributes
  const smallAttrs = resource.attributes.filter((a) => !a.isLarge);
  const largeAttrs = resource.attributes.filter((a) => a.isLarge);

  if (resource.allUnknownAfterApply) {
    writer.paragraph("_(all values known after apply)_");
  } else if (resource.attributes.length === 0) {
    writer.paragraph("_No attribute changes._");
  } else {
    // Render small attributes table
    if (smallAttrs.length > 0) {
      writer.tableHeader(["Attribute", "Before", "After"]);
      for (const attr of smallAttrs) {
        const beforeCell = attr.isSensitive
          ? MarkdownWriter.inlineCode("(sensitive)")
          : MarkdownWriter.escapeCell(attr.before ?? "");
        const afterCell = attr.isSensitive
          ? MarkdownWriter.inlineCode("(sensitive)")
          : formatDiff(attr.before, attr.after, diffFormat);
        writer.tableRow([
          MarkdownWriter.escapeCell(attr.name),
          beforeCell,
          afterCell,
        ]);
      }
      writer.blankLine();
    }

    // Render large attributes as collapsibles
    for (const attr of largeAttrs) {
      const block = renderLargeValue(attr.name, attr.before, attr.after, diffCache);
      if (block) {
        writer.raw(block);
      }
    }
  }

  writer.detailsClose();
}
