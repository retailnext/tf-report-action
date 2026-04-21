/**
 * Outputs element — renders output changes at various detail levels.
 *
 * Like resource rendering, outputs use a split strategy: small values
 * go into an inline table, large values go into collapsible details.
 *
 * 4 effective levels (compact doesn't render outputs):
 * - Level 1 (compact): not rendered
 * - Level 2 (attrs-no-diff): table with plain `<code>` cells, large as context diffs
 * - Level 3 (attrs-char-diff): table with character-level diffs, large as context diffs
 * - Level 4 (full): table with char diffs, large values shown in full
 */

import type { Renderable } from "../renderable/types.js";
import type { OutputChange } from "../model/output.js";
import type { DiffEntry } from "../diff/types.js";
import {
  Table,
  Sequence,
  RawText,
  HtmlText,
  EMPTY,
} from "../renderable/primitives.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import { htmlEscape } from "../renderable/html-escape.js";
import {
  buildInlineDiff,
  buildLargeValueDiff,
  buildLargeValueContextDiff,
} from "./diff-value.js";
import type { DiffFormat } from "./diff-value.js";

/**
 * Options for building output renderables.
 */
export interface OutputRenderOptions {
  readonly diffFormat?: DiffFormat | undefined;
}

/**
 * Builds a Renderable for output changes at a specific detail level.
 *
 * @param outputs - Array of output changes
 * @param options - Render options
 * @param diffCache - Cache for computed line diffs
 * @param level - Detail level (2=attrs-no-diff, 3=attrs-char-diff, 4=full)
 * @returns Renderable for the outputs, or EMPTY if nothing to show
 */
export function buildOutputsRenderable(
  outputs: readonly OutputChange[],
  options: OutputRenderOptions,
  diffCache: Map<string, DiffEntry[]>,
  level: number,
): Renderable {
  if (level <= 1) return EMPTY;

  const useDiff = level >= 3;
  const diffFormat = options.diffFormat ?? "inline";

  // Placeholder outputs always go in the table
  const smallOutputs = outputs.filter(
    (o) => !o.isLarge || o.isSensitive || o.isKnownAfterApply,
  );
  const largeOutputs = outputs.filter(
    (o) => o.isLarge && !o.isSensitive && !o.isKnownAfterApply,
  );

  const parts: Renderable[] = [];

  // Small outputs in a table
  if (smallOutputs.length > 0) {
    const headers = [
      new RawText("Output"),
      new RawText("Action"),
      new RawText("Before"),
      new RawText("After"),
    ];
    const rows: { cells: Renderable[] }[] = [];

    for (const output of smallOutputs) {
      const symbol = ACTION_SYMBOLS[output.action];
      const skipDiff =
        output.isSensitive || output.isKnownAfterApply || !useDiff;

      const before = output.isSensitive
        ? new HtmlText(inlineCode("(sensitive)"))
        : output.before !== null
          ? skipDiff
            ? new HtmlText(inlineCodeCell(output.before))
            : new HtmlText(
                `<code>${escapeHtmlCell(output.before).replace(/\n/g, "<br>")}</code>`,
              )
          : EMPTY;

      const after = output.isSensitive
        ? new HtmlText(inlineCode("(sensitive)"))
        : skipDiff
          ? new HtmlText(inlineCodeCell(output.after ?? ""))
          : buildInlineDiff(output.before, output.after, diffFormat);

      rows.push({
        cells: [
          new HtmlText(escapeCell(output.name)),
          new RawText(symbol),
          before,
          after,
        ],
      });
    }

    parts.push(new Table(headers, rows));
  }

  // Large outputs as collapsible details
  for (const output of largeOutputs) {
    const symbol = ACTION_SYMBOLS[output.action];
    const label = `${symbol} ${output.name}`;
    const block =
      level === 4
        ? buildLargeValueDiff(label, output.before, output.after, diffCache)
        : buildLargeValueContextDiff(
            label,
            output.before,
            output.after,
            diffCache,
          );
    if (block !== EMPTY) {
      parts.push(block);
    }
  }

  if (parts.length === 0) return EMPTY;
  return new Sequence(parts);
}

// ---------------------------------------------------------------------------
// Escape helpers
// ---------------------------------------------------------------------------

/** Escape pipe characters for markdown table cells. */
function escapeCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/** Escape HTML + pipe for table cell context. */
function escapeHtmlCell(value: string): string {
  return htmlEscape(value).replace(/\|/g, "&#124;");
}

/** Wrap value in `<code>` with HTML escaping. */
function inlineCode(value: string): string {
  return `<code>${htmlEscape(value)}</code>`;
}

/** Wrap value in `<code>` with HTML + pipe escaping. */
function inlineCodeCell(value: string): string {
  return `<code>${htmlEscape(value).replace(/\|/g, "&#124;")}</code>`;
}
