/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

import type { DiffFormat } from "./options.js";
import { buildCharDiff } from "../diff/char-diff.js";
import { MarkdownWriter } from "./writer.js";

/**
 * Formats a before/after pair as an inline diff suitable for a markdown table cell.
 *
 * - Both null/empty: return ""
 * - Identical: return value wrapped in `<code>` tags
 * - Different with format "inline": character-level HTML diff with <del>/<ins> wrapping
 * - Different with format "simple": "- before<br>+ after"
 */
export function formatDiff(
  before: string | null,
  after: string | null,
  format: DiffFormat,
): string {
  const b = before ?? "";
  const a = after ?? "";

  if (b === "" && a === "") return "";

  if (b === a) {
    return MarkdownWriter.inlineCodeCell(b);
  }

  if (format === "simple") {
    const parts: string[] = [];
    if (b !== "") parts.push(`- ${MarkdownWriter.escapeCell(b)}`);
    if (a !== "") parts.push(`+ ${MarkdownWriter.escapeCell(a)}`);
    return parts.join("<br>");
  }

  // inline format — character-level diff per line
  const beforeLines = b.split("\n");
  const afterLines = a.split("\n");
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const resultLines: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const bl = beforeLines[i] ?? "";
    const al = afterLines[i] ?? "";

    if (bl === al) {
      resultLines.push(MarkdownWriter.escapeHtmlCell(bl));
      continue;
    }

    const charDiff = buildCharDiff(bl, al);
    let line = "";
    let delBuf = "";
    let insBuf = "";

    function flushBuffers(): void {
      if (delBuf) {
        line += `<del style="background:#fdd">${MarkdownWriter.escapeHtmlCell(delBuf)}</del>`;
        delBuf = "";
      }
      if (insBuf) {
        line += `<ins style="background:#dfd">${MarkdownWriter.escapeHtmlCell(insBuf)}</ins>`;
        insBuf = "";
      }
    }

    for (const entry of charDiff) {
      if (entry.kind === "removed") {
        if (insBuf) {
          flushBuffers();
        }
        delBuf += entry.value;
      } else if (entry.kind === "added") {
        // Deletions accumulate in delBuf first; insertions follow in insBuf.
        // Both are flushed together when an "equal" entry arrives.
        insBuf += entry.value;
      } else {
        flushBuffers();
        line += MarkdownWriter.escapeHtmlCell(entry.value);
      }
    }
    flushBuffers();
    resultLines.push(line);
  }

  return `<code>${resultLines.join("<br>")}</code>`;
}
