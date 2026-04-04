import type { DiffEntry } from "../diff/types.js";
import { buildLineDiff } from "../diff/line-diff.js";
import { escapeHtml } from "../raw-formatter/jsonl.js";

/** Number of unchanged lines to show around each changed hunk. */
const CONTEXT_LINES = 3;

/**
 * Renders a large attribute value as a collapsible `<details>` block showing
 * only changed lines plus a few lines of surrounding context (like `diff -u`).
 *
 * This is the space-efficient alternative to `renderLargeValue` which shows
 * every line. For a 500-line JSON policy where 3 lines changed, this produces
 * ~9 lines instead of ~500.
 *
 * Returns an empty string when both values are null or when there are no
 * differences to show.
 */
export function renderLargeValueContextDiff(
  name: string,
  before: string | null,
  after: string | null,
  cache: Map<string, DiffEntry[]>,
): string {
  const bVal = before ? prettyPrint(before) : null;
  const aVal = after ? prettyPrint(after) : null;

  if (bVal === null && aVal === null) return "";

  // Added or removed — show full value (no context filtering needed)
  if (bVal === null && aVal !== null) {
    return buildBlock(name, `\`\`\`\n${aVal}\n\`\`\``, 0, 0);
  }
  if (bVal !== null && aVal === null) {
    return buildBlock(name, `\`\`\`\n${bVal}\n\`\`\``, 0, 0);
  }

  // Both present — build context-limited diff
  if (bVal === null || aVal === null) return "";
  const diff = buildLineDiff(bVal, aVal, cache);
  return renderContextHunks(name, diff);
}

/**
 * Filters a full line diff down to changed lines plus surrounding context,
 * inserting `...` markers for omitted ranges.
 */
function renderContextHunks(name: string, diff: readonly DiffEntry[]): string {
  // Mark which lines are "interesting" (changed) or within context range
  const visible = new Array<boolean>(diff.length).fill(false);
  let addedLines = 0;
  let removedLines = 0;

  for (let i = 0; i < diff.length; i++) {
    const entry = diff[i];
    if (entry === undefined) continue;
    if (entry.kind !== "unchanged") {
      if (entry.kind === "added") addedLines++;
      if (entry.kind === "removed") removedLines++;
      // Mark this line and surrounding context as visible
      for (
        let j = Math.max(0, i - CONTEXT_LINES);
        j <= Math.min(diff.length - 1, i + CONTEXT_LINES);
        j++
      ) {
        visible[j] = true;
      }
    }
  }

  // If no changes found, nothing to show
  if (addedLines === 0 && removedLines === 0) return "";

  // Build context diff output with `...` for omitted ranges
  const lines: string[] = [];
  let inGap = false;

  for (let i = 0; i < diff.length; i++) {
    if (!visible[i]) {
      if (!inGap) {
        lines.push("  ...");
        inGap = true;
      }
      continue;
    }
    inGap = false;
    const entry = diff[i];
    if (entry === undefined) continue;
    const prefix =
      entry.kind === "removed" ? "-" : entry.kind === "added" ? "+" : " ";
    lines.push(`${prefix} ${entry.value}`);
  }

  const fenced = `\`\`\`diff\n${lines.join("\n")}\n\`\`\``;
  return buildBlock(name, fenced, addedLines, removedLines);
}

/** Builds a collapsible `<details>` block for a large value. */
function buildBlock(
  name: string,
  content: string,
  addedLines: number,
  removedLines: number,
): string {
  const escapedName = escapeHtml(name);
  const hasDiff = addedLines > 0 || removedLines > 0;
  const suffix = hasDiff
    ? ` (large value; +${String(addedLines)}, -${String(removedLines)})`
    : " (large value)";

  return `<details>\n<summary>${escapedName}${suffix}</summary>\n\n${content}\n\n</details>\n`;
}

function prettyPrint(value: string): string {
  const trimmed = value.trim();
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
