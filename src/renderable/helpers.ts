/**
 * Shared rendering helper functions for format-aware output patterns
 * that are common across multiple semantic Renderables.
 *
 * These are NOT Renderable classes — they are pure functions that
 * produce format-specific strings. They exist to avoid duplicating
 * the same format-switching logic across multiple element files.
 */

import type { Renderable, OutputFormat } from "./types.js";
import { htmlEscape } from "./html-escape.js";
import { markdownEscape } from "./markdown-escape.js";

/**
 * Wraps text in a markdown code span with appropriate backtick fencing.
 *
 * Content inside code spans is literal — no backslash escaping applies.
 * If the text contains backticks, a longer fence is chosen. A leading/trailing
 * space is added when the content starts or ends with a backtick to prevent
 * the CommonMark parser from treating it as part of the delimiter.
 */
export function mdCodeSpan(text: string): string {
  // Find the longest run of consecutive backticks to determine fence length
  let maxRun = 0;
  let currentRun = 0;
  for (const ch of text) {
    currentRun = ch === "`" ? currentRun + 1 : 0;
    if (currentRun > maxRun) maxRun = currentRun;
  }
  const fence = "`".repeat(maxRun + 1);

  // CommonMark 6.1: if content begins or ends with a backtick, add space
  // padding to prevent ambiguity with the delimiter.
  const needsPadding = text.startsWith("`") || text.endsWith("`");
  return needsPadding ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

/**
 * Renders a contextual note — italic in markdown, `<em>` in HTML.
 *
 * Used by owning Renderables for their "no data" / "omitted" states.
 */
export function renderNote(text: string, format: OutputFormat): string {
  return format === "markdown"
    ? `_${markdownEscape(text)}_\n\n`
    : `<p><em>${htmlEscape(text)}</em></p>\n`;
}

/**
 * Creates a table cell Renderable with plain escaped text.
 * Used inside render() methods as Table cell content.
 * Markdown: markdownEscape; HTML: htmlEscape.
 */
export function textCell(text: string): Renderable {
  const renderFn = (format: OutputFormat): string =>
    format === "markdown" ? markdownEscape(text) : htmlEscape(text);
  return { size: (f: OutputFormat) => renderFn(f).length, render: renderFn };
}

/**
 * Creates an inline code Renderable.
 * Markdown: `` `escaped` ``; HTML: `<code>escaped</code>`.
 */
export function codeSpan(text: string): Renderable {
  const renderFn = (format: OutputFormat): string =>
    format === "markdown"
      ? mdCodeSpan(text)
      : `<code>${htmlEscape(text)}</code>`;
  return { size: (f: OutputFormat) => renderFn(f).length, render: renderFn };
}

/**
 * Creates a bold text Renderable.
 * Markdown: `**escaped**`; HTML: `<strong>escaped</strong>`.
 */
export function boldSpan(text: string): Renderable {
  const renderFn = (format: OutputFormat): string =>
    format === "markdown"
      ? `**${markdownEscape(text)}**`
      : `<strong>${htmlEscape(text)}</strong>`;
  return { size: (f: OutputFormat) => renderFn(f).length, render: renderFn };
}

/**
 * Creates an HTML `<code>` table cell.
 * Both formats use `<code>` tags (GitHub renders inline HTML in tables).
 * Markdown: `|` is entity-escaped to prevent table cell breaks.
 */
export function htmlCodeCell(value: string): Renderable {
  const renderFn = (format: OutputFormat): string => {
    const escaped = htmlEscape(value);
    return format === "markdown"
      ? `<code>${escaped.replace(/\|/g, "&#124;")}</code>`
      : `<code>${escaped}</code>`;
  };
  return { size: (f: OutputFormat) => renderFn(f).length, render: renderFn };
}

/**
 * Creates an HTML `<code>` table cell with newlines rendered as `<br>`.
 * Both formats use `<code>` tags. Markdown: `|` is entity-escaped.
 */
export function htmlCodeCellMultiline(value: string): Renderable {
  const renderFn = (format: OutputFormat): string => {
    const escaped = htmlEscape(value).replace(/\n/g, "<br>");
    return format === "markdown"
      ? `<code>${escaped.replace(/\|/g, "&#124;")}</code>`
      : `<code>${escaped}</code>`;
  };
  return { size: (f: OutputFormat) => renderFn(f).length, render: renderFn };
}

/**
 * Creates a Details summary Renderable from plain text.
 * Details summaries are always rendered as HTML (inside `<summary>` tags),
 * so this always HTML-escapes regardless of the requested format.
 */
export function detailsSummary(text: string): Renderable {
  const html = htmlEscape(text);
  return { size: () => html.length, render: () => html };
}
