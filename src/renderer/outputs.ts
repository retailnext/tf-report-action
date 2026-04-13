import type { OutputChange } from "../model/output.js";
import type { RenderOptions } from "./options.js";
import type { ResourceRenderMode } from "./render-mode.js";
import type { DiffEntry } from "../diff/types.js";
import { MarkdownWriter } from "./writer.js";
import { formatDiff } from "./diff-format.js";
import { renderLargeValue } from "./large-value.js";
import { renderLargeValueContextDiff } from "../diff/context-diff.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";

/**
 * Renders output changes using the same split strategy as resource attributes:
 * small values go into an inline table with character-level diffs, large values
 * (JSON objects, XML, multi-line strings) go into collapsible `<details>` blocks
 * with line-level diffs.
 *
 * Outputs with placeholder values (sensitive or known-after-apply) are always
 * rendered in the table regardless of `isLarge`, because diffing a real value
 * against a sentinel string produces meaningless output.
 *
 * The `mode` parameter controls detail level:
 * - `"compact"` — outputs are not rendered (caller should not invoke this)
 * - `"attrs-no-diff"` — table with plain `<code>` cells, large as context diffs
 * - `"attrs-char-diff"` — table with character-level diffs, large as context diffs
 * - `"full"` — table with character-level diffs, large values shown in full
 */
export function renderOutputs(
  outputs: readonly OutputChange[],
  writer: MarkdownWriter,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
  mode: ResourceRenderMode = "full",
): void {
  if (mode === "compact") return;

  const useDiff = mode === "attrs-char-diff" || mode === "full";
  const diffFormat = options.diffFormat ?? "inline";

  // Placeholder outputs always go in the table — diffing against a sentinel is meaningless
  const smallOutputs = outputs.filter(
    (o) => !o.isLarge || o.isSensitive || o.isKnownAfterApply,
  );
  const largeOutputs = outputs.filter(
    (o) => o.isLarge && !o.isSensitive && !o.isKnownAfterApply,
  );

  // Render small outputs in an attribute-style table
  if (smallOutputs.length > 0) {
    writer.tableHeader(["Output", "Action", "Before", "After"]);
    for (const output of smallOutputs) {
      const symbol = ACTION_SYMBOLS[output.action];
      const skipDiff =
        output.isSensitive || output.isKnownAfterApply || !useDiff;
      const before = output.isSensitive
        ? MarkdownWriter.inlineCode("(sensitive)")
        : output.before !== null
          ? skipDiff
            ? MarkdownWriter.inlineCodeCell(output.before)
            : `<code>${MarkdownWriter.escapeHtmlCell(output.before).replace(/\n/g, "<br>")}</code>`
          : "";
      const after = output.isSensitive
        ? MarkdownWriter.inlineCode("(sensitive)")
        : skipDiff
          ? MarkdownWriter.inlineCodeCell(output.after ?? "")
          : formatDiff(output.before, output.after, diffFormat);
      writer.tableRow([
        MarkdownWriter.escapeCell(output.name),
        symbol,
        before,
        after,
      ]);
    }
    writer.blankLine();
  }

  // Render large outputs as collapsible details blocks with line-level diffs
  for (const output of largeOutputs) {
    const symbol = ACTION_SYMBOLS[output.action];
    const label = `${symbol} ${output.name}`;
    const block =
      mode === "full"
        ? renderLargeValue(label, output.before, output.after, diffCache)
        : renderLargeValueContextDiff(
            label,
            output.before,
            output.after,
            diffCache,
          );
    if (block) {
      writer.raw(block);
    }
  }
}
