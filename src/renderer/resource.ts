/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

import type { ResourceChange } from "../model/resource.js";
import type { Diagnostic } from "../model/diagnostic.js";
import { MarkdownWriter } from "./writer.js";
import type { RenderOptions } from "./options.js";
import type { DiffEntry } from "../diff/types.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import {
  STATUS_FAILURE,
  DIAGNOSTIC_ERROR,
  DIAGNOSTIC_WARNING,
} from "../model/status-icons.js";
import { formatDiff } from "./diff-format.js";
import { renderLargeValue } from "./large-value.js";
import { deriveInstanceName } from "./address.js";

/**
 * Per-resource apply context passed when rendering apply reports.
 * Provides the failure status and any resource-specific diagnostics.
 */
export interface ApplyContext {
  readonly failed: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Renders a single resource change as a collapsible details block.
 * When `applyContext` is provided, failed resources get `<details open>`
 * and a ❌ indicator; diagnostics are rendered inline after attributes.
 */
export function renderResource(
  resource: ResourceChange,
  writer: MarkdownWriter,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
  applyContext?: ApplyContext,
): void {
  const symbol = ACTION_SYMBOLS[resource.action];
  const diffFormat = options.diffFormat ?? "inline";

  // Build summary text
  const changedAttrs = resource.attributes
    .filter(
      (a) => !a.isSensitive && !a.isKnownAfterApply && a.before !== a.after,
    )
    .map((a) => a.name);

  let summaryText = `${symbol} <strong>${MarkdownWriter.escapeCell(resource.type)}</strong> ${MarkdownWriter.escapeCell(deriveInstanceName(resource.address, resource.type))}`;

  if (resource.action === "update" && changedAttrs.length > 0) {
    const hint = changedAttrs.slice(0, 5).join(", ");
    summaryText += ` — changed: ${MarkdownWriter.escapeCell(hint)}`;
  }

  if (applyContext?.failed) {
    summaryText += ` ${STATUS_FAILURE}`;
  }

  const shouldOpen =
    applyContext !== undefined &&
    (applyContext.failed || applyContext.diagnostics.length > 0);
  writer.detailsOpen(summaryText, shouldOpen);
  writer.codeFence(resource.address);

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
  } else if (resource.attributes.length === 0 && resource.hasAttributeDetail) {
    writer.paragraph("_No attribute changes._");
  } else if (resource.attributes.length > 0) {
    // Render small attributes table
    if (smallAttrs.length > 0) {
      writer.tableHeader(["Attribute", "Before", "After"]);
      for (const attr of smallAttrs) {
        // Sensitive and placeholder values are displayed as-is, never char-diffed
        const skipDiff = attr.isSensitive || attr.isKnownAfterApply;
        const beforeCell = skipDiff
          ? MarkdownWriter.inlineCode(
              MarkdownWriter.escapeCell(attr.before ?? ""),
            )
          : MarkdownWriter.escapeCell(attr.before ?? "");
        const afterCell = skipDiff
          ? MarkdownWriter.inlineCode(
              MarkdownWriter.escapeCell(attr.after ?? ""),
            )
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
      const block = renderLargeValue(
        attr.name,
        attr.before,
        attr.after,
        diffCache,
      );
      if (block) {
        writer.raw(block);
      }
    }
  }

  // Render inline diagnostics (errors then warnings)
  if (applyContext && applyContext.diagnostics.length > 0) {
    const errors = applyContext.diagnostics.filter(
      (d) => d.severity === "error",
    );
    const warnings = applyContext.diagnostics.filter(
      (d) => d.severity === "warning",
    );
    for (const diag of [...errors, ...warnings]) {
      const prefix =
        diag.severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
      writer.paragraph(`${prefix} **${diag.summary}**`);
      if (diag.detail) {
        writer.codeFence(diag.detail);
      }
    }
  }

  writer.detailsClose();
}
