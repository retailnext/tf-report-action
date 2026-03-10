import type { Summary } from "../model/summary.js";
import type { MarkdownWriter } from "./writer.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";

/**
 * Renders the plan summary table to the writer.
 * Shows one row per non-zero action, plus a "Total" row.
 */
export function renderSummary(summary: Summary, writer: MarkdownWriter): void {
  writer.tableHeader(["Action", "Count"]);

  if (summary.add > 0) {
    writer.tableRow([`${ACTION_SYMBOLS.create} Add`, String(summary.add)]);
  }
  if (summary.change > 0) {
    writer.tableRow([`${ACTION_SYMBOLS.update} Change`, String(summary.change)]);
  }
  if (summary.destroy > 0) {
    writer.tableRow([`${ACTION_SYMBOLS.delete} Destroy`, String(summary.destroy)]);
  }
  if (summary.replace > 0) {
    writer.tableRow([`${ACTION_SYMBOLS.replace} Replace`, String(summary.replace)]);
  }

  writer.tableRow(["**Total**", `**${String(summary.total)}**`]);
  writer.blankLine();
}
