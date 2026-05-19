/**
 * Diff value helpers — builds Renderables for inline character-level diffs,
 * large value line-level diffs, and context-limited diffs.
 *
 * These replace the markdown-producing functions in `renderer/diff-format.ts`,
 * `renderer/large-value.ts`, and `diff/context-diff.ts` with Renderable
 * objects that can render to both markdown and HTML.
 */

import type { Renderable, OutputFormat } from "../model/renderable.js";
import type { DiffEntry, DiffFormat } from "../diff/types.js";
import { Details, CodeBlock, EMPTY } from "../renderable/primitives.js";
import { buildLineDiff } from "../diff/line-diff.js";
import { buildCharDiff } from "../diff/char-diff.js";
import { htmlEscape } from "../renderable/html-escape.js";
import { detailsSummary, htmlCodeCell } from "../renderable/helpers.js";

/** Number of unchanged lines to show around each changed hunk in context diffs. */
const CONTEXT_LINES = 3;

/**
 * Formats a before/after pair as an inline diff suitable for a table cell.
 *
 * Returns a Renderable (identical in both formats since table cells
 * contain HTML in both markdown and HTML contexts).
 *
 * - Both null/empty: returns EMPTY
 * - Identical: value wrapped in `<code>` tags
 * - Different with "inline": character-level HTML diff with `<del>`/`<ins>`
 * - Different with "simple": `- before<br>+ after`
 */
export function buildInlineDiff(
  before: string | null,
  after: string | null,
  format: DiffFormat,
): Renderable {
  const b = before ?? "";
  const a = after ?? "";

  if (b === "" && a === "") return EMPTY;

  if (b === a) {
    return htmlCodeCell(b);
  }

  if (format === "simple") {
    return simpleDiffCell(b, a);
  }

  // Inline format — character-level diff per line
  return new InlineCharDiffCell(b, a);
}

/**
 * Builds a collapsible details block for a large attribute value showing
 * the full line-level diff.
 *
 * Returns EMPTY when both values are null.
 */
export function buildLargeValueDiff(
  name: string,
  before: string | null,
  after: string | null,
  cache: Map<string, DiffEntry[]>,
): Renderable {
  const bVal = before ? prettyPrint(before) : null;
  const aVal = after ? prettyPrint(after) : null;

  if (bVal === null && aVal === null) return EMPTY;

  if (bVal !== null && aVal === null) {
    return buildOneSidedBlock(name, bVal, "removed");
  }

  if (bVal === null && aVal !== null) {
    return buildOneSidedBlock(name, aVal, "added");
  }

  if (bVal === null || aVal === null) return EMPTY;

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

  return buildDetailsBlock(
    name,
    new CodeBlock(codeContent, "diff"),
    addedLines,
    removedLines,
  );
}

/**
 * Builds a collapsible details block for a large attribute value showing
 * only changed lines with context (like `diff -u`).
 *
 * Returns EMPTY when both values are null or there are no differences.
 */
export function buildLargeValueContextDiff(
  name: string,
  before: string | null,
  after: string | null,
  cache: Map<string, DiffEntry[]>,
): Renderable {
  const bVal = before ? prettyPrint(before) : null;
  const aVal = after ? prettyPrint(after) : null;

  if (bVal === null && aVal === null) return EMPTY;

  if (bVal === null && aVal !== null) {
    return buildOneSidedBlock(name, aVal, "added");
  }
  if (bVal !== null && aVal === null) {
    return buildOneSidedBlock(name, bVal, "removed");
  }

  if (bVal === null || aVal === null) return EMPTY;

  const diff = buildLineDiff(bVal, aVal, cache);
  return renderContextHunks(name, diff);
}

/** Filters a full line diff to context hunks and builds a Details block. */
function renderContextHunks(
  name: string,
  diff: readonly DiffEntry[],
): Renderable {
  const visible = new Array<boolean>(diff.length).fill(false);
  let addedLines = 0;
  let removedLines = 0;

  for (let i = 0; i < diff.length; i++) {
    const entry = diff[i];
    if (entry === undefined) continue;
    if (entry.kind !== "unchanged") {
      if (entry.kind === "added") addedLines++;
      if (entry.kind === "removed") removedLines++;
      for (
        let j = Math.max(0, i - CONTEXT_LINES);
        j <= Math.min(diff.length - 1, i + CONTEXT_LINES);
        j++
      ) {
        visible[j] = true;
      }
    }
  }

  if (addedLines === 0 && removedLines === 0) return EMPTY;

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

  return buildDetailsBlock(
    name,
    new CodeBlock(lines.join("\n"), "diff"),
    addedLines,
    removedLines,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a one-sided diff block where only before or after exists.
 * Prefixes every line with `+` (added) or `-` (removed) so direction
 * is unambiguous.
 */
function buildOneSidedBlock(
  name: string,
  value: string,
  kind: "added" | "removed",
): Renderable {
  const prefix = kind === "added" ? "+" : "-";
  const lines = value.split("\n");
  const codeContent = lines.map((line) => `${prefix} ${line}`).join("\n");
  const lineCount = lines.length;
  const addedLines = kind === "added" ? lineCount : 0;
  const removedLines = kind === "removed" ? lineCount : 0;
  return buildDetailsBlock(
    name,
    new CodeBlock(codeContent, "diff"),
    addedLines,
    removedLines,
  );
}

/** Builds a Details block with a summary showing diff stats. */
function buildDetailsBlock(
  name: string,
  content: Renderable,
  addedLines: number,
  removedLines: number,
): Renderable {
  const hasDiff = addedLines > 0 || removedLines > 0;
  const suffix = hasDiff
    ? ` (large value; +${String(addedLines)}, -${String(removedLines)})`
    : " (large value)";

  const summary = detailsSummary(name + suffix);
  return new Details(summary, content);
}

/** Try JSON pretty-print, fall back to original value. */
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

// ---------------------------------------------------------------------------
// Semantic diff cell renderables
// ---------------------------------------------------------------------------

/** Escape HTML + pipe for table cell context. */
function escapeHtmlCell(value: string): string {
  return htmlEscape(value).replace(/\|/g, "&#124;");
}

/**
 * Simple diff cell — renders `- before<br>+ after` with proper escaping.
 * Stores raw before/after; escapes at render time.
 */
function simpleDiffCell(before: string, after: string): Renderable {
  return {
    size(format: OutputFormat): number {
      return this.render(format).length;
    },
    render(format: OutputFormat): string {
      const parts: string[] = [];
      if (before !== "") parts.push(`- ${escapeHtmlCell(before)}`);
      if (after !== "") parts.push(`+ ${escapeHtmlCell(after)}`);
      const html = parts.join("<br>");
      if (format === "markdown") {
        return html.replace(/\|/g, "&#124;");
      }
      return html;
    },
  };
}

/**
 * Inline character-level diff cell — renders `<code>` block with
 * `<del>`/`<ins>` annotations for changed characters.
 * Stores raw before/after; computes diff at render time.
 */
class InlineCharDiffCell implements Renderable {
  private readonly before: string;
  private readonly after: string;

  constructor(before: string, after: string) {
    this.before = before;
    this.after = after;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    const beforeLines = this.before.split("\n");
    const afterLines = this.after.split("\n");
    const maxLen = Math.max(beforeLines.length, afterLines.length);
    const resultLines: string[] = [];

    for (let i = 0; i < maxLen; i++) {
      const bl = beforeLines[i] ?? "";
      const al = afterLines[i] ?? "";

      if (bl === al) {
        resultLines.push(escapeHtmlCell(bl));
        continue;
      }

      const charDiff = buildCharDiff(bl, al);
      let line = "";
      let delBuf = "";
      let insBuf = "";

      const flushBuffers = (): void => {
        if (delBuf) {
          line += `<del style="background:#fdd">${escapeHtmlCell(delBuf)}</del>`;
          delBuf = "";
        }
        if (insBuf) {
          line += `<ins style="background:#dfd">${escapeHtmlCell(insBuf)}</ins>`;
          insBuf = "";
        }
      };

      for (const entry of charDiff) {
        if (entry.kind === "removed") {
          if (insBuf) {
            flushBuffers();
          }
          delBuf += entry.value;
        } else if (entry.kind === "added") {
          insBuf += entry.value;
        } else {
          flushBuffers();
          line += escapeHtmlCell(entry.value);
        }
      }
      flushBuffers();
      resultLines.push(line);
    }

    const html = `<code>${resultLines.join("<br>")}</code>`;
    if (format === "markdown") {
      return html.replace(/\|/g, "&#124;");
    }
    return html;
  }
}
