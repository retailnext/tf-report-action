/**
 * Diff value helpers — builds Renderables for inline character-level diffs,
 * large value line-level diffs, and context-limited diffs.
 *
 * These replace the markdown-producing functions in `renderer/diff-format.ts`,
 * `renderer/large-value.ts`, and `diff/context-diff.ts` with Renderable
 * objects that can render to both markdown and HTML.
 */

import type { Renderable } from "../renderable/types.js";
import type { DiffEntry } from "../diff/types.js";
import {
  Details,
  CodeBlock,
  HtmlText,
  EMPTY,
} from "../renderable/primitives.js";
import { buildLineDiff } from "../diff/line-diff.js";
import { buildCharDiff } from "../diff/char-diff.js";
import { htmlEscape } from "../renderable/html-escape.js";

/** Number of unchanged lines to show around each changed hunk in context diffs. */
const CONTEXT_LINES = 3;

// ---------------------------------------------------------------------------
// Inline table-cell diffs
// ---------------------------------------------------------------------------

/** Diff format for inline attribute changes: "inline" or "simple". */
export type DiffFormat = "inline" | "simple";

/**
 * Formats a before/after pair as an inline diff suitable for a table cell.
 *
 * Returns an HtmlText renderable (identical in both formats since table cells
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
    return new HtmlText(inlineCodeCell(b));
  }

  if (format === "simple") {
    const parts: string[] = [];
    if (b !== "") parts.push(`- ${escapeCell(htmlEscape(b))}`);
    if (a !== "") parts.push(`+ ${escapeCell(htmlEscape(a))}`);
    return new HtmlText(parts.join("<br>"));
  }

  // Inline format — character-level diff per line
  const beforeLines = b.split("\n");
  const afterLines = a.split("\n");
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

    function flushBuffers(): void {
      if (delBuf) {
        line += `<del style="background:#fdd">${escapeHtmlCell(delBuf)}</del>`;
        delBuf = "";
      }
      if (insBuf) {
        line += `<ins style="background:#dfd">${escapeHtmlCell(insBuf)}</ins>`;
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
        insBuf += entry.value;
      } else {
        flushBuffers();
        line += escapeHtmlCell(entry.value);
      }
    }
    flushBuffers();
    resultLines.push(line);
  }

  return new HtmlText(`<code>${resultLines.join("<br>")}</code>`);
}

// ---------------------------------------------------------------------------
// Large value diffs (full and context)
// ---------------------------------------------------------------------------

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
    return buildDetailsBlock(name, new CodeBlock(bVal), 0, 0);
  }

  if (bVal === null && aVal !== null) {
    return buildDetailsBlock(name, new CodeBlock(aVal), 0, 0);
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
    return buildDetailsBlock(name, new CodeBlock(aVal), 0, 0);
  }
  if (bVal !== null && aVal === null) {
    return buildDetailsBlock(name, new CodeBlock(bVal), 0, 0);
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

  const summaryHtml = `${htmlEscape(name)}${suffix}`;
  return new Details(new HtmlText(summaryHtml), content);
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

/** Escape pipe characters for HTML table cell context. */
function escapeCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/** Escape HTML + pipe for table cell context. */
function escapeHtmlCell(value: string): string {
  return htmlEscape(value).replace(/\|/g, "&#124;");
}

/** Wrap value in `<code>` with HTML + pipe escaping. */
function inlineCodeCell(value: string): string {
  return `<code>${htmlEscape(value).replace(/\|/g, "&#124;")}</code>`;
}
