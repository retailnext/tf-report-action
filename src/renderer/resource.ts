/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

import type { ResourceChange } from "../model/resource.js";
import type { Diagnostic } from "../model/diagnostic.js";
import type { ResourceRenderMode } from "./render-mode.js";
import type { ApplyContext } from "./apply-context.js";
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
import { renderLargeValueContextDiff } from "../diff/context-diff.js";
import { deriveInstanceName } from "./address.js";

// Re-export for consumers that imported ApplyContext from resource.ts
export type { ApplyContext } from "./apply-context.js";

/**
 * Renders a single resource change as a collapsible details block.
 *
 * The `mode` parameter controls how much detail is shown:
 * - `"compact"` — summary line, address, import/moved metadata, diagnostics only
 * - `"attrs-no-diff"` — adds attribute table with plain `<code>` cells
 * - `"attrs-char-diff"` — attribute table with character-level diffs
 * - `"full"` — character-level diffs plus full large-value blocks
 *
 * When `applyContext` is provided, failed resources get `<details open>`
 * and a ❌ indicator; diagnostics are rendered inline after attributes.
 */
export function renderResource(
  resource: ResourceChange,
  writer: MarkdownWriter,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
  mode: ResourceRenderMode = "full",
  applyContext?: ApplyContext,
): void {
  const symbol = ACTION_SYMBOLS[resource.action];

  // Build summary text
  const changedAttrs = resource.attributes
    .filter(
      (a) => !a.isSensitive && !a.isKnownAfterApply && a.before !== a.after,
    )
    .map((a) => a.name);

  let summaryText = `${symbol} <strong>${MarkdownWriter.escapeHtml(resource.type)}</strong> ${MarkdownWriter.escapeHtml(deriveInstanceName(resource.address, resource.type))}`;

  if (resource.action === "update" && changedAttrs.length > 0) {
    const hint = changedAttrs.slice(0, 5).join(", ");
    summaryText += ` — changed: ${MarkdownWriter.escapeHtml(hint)}`;
  }

  if (applyContext?.failed) {
    summaryText += ` ${STATUS_FAILURE}`;
  }

  const shouldOpen =
    applyContext !== undefined &&
    (applyContext.failed || applyContext.diagnostics.length > 0);
  writer.detailsOpenHtml(summaryText, shouldOpen);
  writer.codeFence(resource.address);

  // Show import/moved-from metadata
  if (resource.importId !== null) {
    writer.paragraph(
      `**Import ID:** ${MarkdownWriter.inlineCode(resource.importId)}`,
    );
  }
  if (resource.movedFromAddress !== null) {
    writer.paragraph(
      `**Moved from:** ${MarkdownWriter.inlineCode(resource.movedFromAddress)}`,
    );
  }

  // In compact mode, skip all attribute rendering
  if (mode !== "compact") {
    renderAttributes(resource, writer, options, diffCache, mode);
  }

  // Render inline diagnostics (errors then warnings)
  if (applyContext && applyContext.diagnostics.length > 0) {
    renderInlineDiagnostics(applyContext.diagnostics, writer);
  }

  writer.detailsClose();
}

/** Renders resource attributes at the specified detail level. */
function renderAttributes(
  resource: ResourceChange,
  writer: MarkdownWriter,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
  mode: ResourceRenderMode,
): void {
  const smallAttrs = resource.attributes.filter((a) => !a.isLarge);
  const largeAttrs = resource.attributes.filter((a) => a.isLarge);
  const useCharDiff = mode === "attrs-char-diff" || mode === "full";
  const diffFormat = options.diffFormat ?? "inline";

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
          ? MarkdownWriter.inlineCodeCell(attr.before ?? "")
          : `<code>${MarkdownWriter.escapeHtmlCell(attr.before ?? "").replace(/\n/g, "<br>")}</code>`;
        const afterCell =
          skipDiff || !useCharDiff
            ? MarkdownWriter.inlineCodeCell(attr.after ?? "")
            : formatDiff(attr.before, attr.after, diffFormat);
        writer.tableRow([
          MarkdownWriter.escapeCell(MarkdownWriter.escapeHtml(attr.name)),
          beforeCell,
          afterCell,
        ]);
      }
      writer.blankLine();
    }

    // Render large attributes as collapsibles
    for (const attr of largeAttrs) {
      const block =
        mode === "full"
          ? renderLargeValue(attr.name, attr.before, attr.after, diffCache)
          : renderLargeValueContextDiff(
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
}

/** Renders inline diagnostics (errors then warnings) for a resource. */
function renderInlineDiagnostics(
  diagnostics: readonly Diagnostic[],
  writer: MarkdownWriter,
): void {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  for (const diag of [...errors, ...warnings]) {
    const prefix =
      diag.severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
    writer.paragraph(
      `${prefix} **${MarkdownWriter.escapeHtml(diag.summary)}**`,
    );
    if (diag.detail) {
      writer.codeFence(diag.detail);
    }
  }
}
