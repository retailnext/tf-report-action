/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

import type { DiffEntry } from "../diff/types.js";
import { buildLineDiff } from "../diff/line-diff.js";
import { escapeHtml } from "../raw-formatter/jsonl.js";

/**
 * Formats a large attribute value as a collapsible markdown block.
 * Uses line-level diff when both before and after are present.
 *
 * Returns a complete `<details>/<summary>` HTML block as a markdown string.
 */
export function renderLargeValue(
  name: string,
  before: string | null,
  after: string | null,
  cache: Map<string, DiffEntry[]>,
): string {
  const bVal = before ? prettyPrint(before) : null;
  const aVal = after ? prettyPrint(after) : null;

  if (bVal === null && aVal === null) return "";

  if (bVal !== null && aVal === null) {
    // Removed value
    return buildDetailsBlock(name, `\`\`\`\n${bVal}\n\`\`\``, 0, 0);
  }

  if (bVal === null && aVal !== null) {
    // Added value
    return buildDetailsBlock(name, `\`\`\`\n${aVal}\n\`\`\``, 0, 0);
  }

  // Both present — show diff
  if (bVal === null || aVal === null) {
    // Shouldn't be reached after the guards above, but satisfy the type checker
    return "";
  }
  const diff = buildLineDiff(bVal, aVal, cache);
  const addedLines = diff.filter((e) => e.kind === "added").length;
  const removedLines = diff.filter((e) => e.kind === "removed").length;

  const codeContent = diff
    .map((e) => {
      const prefix =
        e.kind === "removed" ? "-" : e.kind === "added" ? "+" : " ";
      return `${prefix} ${e.value}`;
    })
    .join("\n");

  const fenced = `\`\`\`diff\n${codeContent}\n\`\`\``;
  return buildDetailsBlock(name, fenced, addedLines, removedLines);
}

function buildDetailsBlock(
  name: string,
  content: string,
  addedLines: number,
  removedLines: number,
): string {
  const escapedName = escapeHtml(name);
  const hasDiff = addedLines > 0 || removedLines > 0;
  const summary = hasDiff
    ? `Large value: ${escapedName} (+${String(addedLines)}, -${String(removedLines)})`
    : `Large value: ${escapedName}`;

  return `<details>\n<summary>${summary}</summary>\n\n${content}\n\n</details>\n`;
}

function prettyPrint(value: string): string {
  const trimmed = value.trim();
  // Try JSON pretty-print
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // not valid JSON — fall through
    }
  }
  return value;
}
