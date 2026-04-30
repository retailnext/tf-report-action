/**
 * Markdown escaping utilities.
 *
 * Escapes both markdown-significant characters AND HTML characters,
 * because GitHub Flavored Markdown renders inline HTML — an unescaped
 * `<script>` in markdown output is just as dangerous as in raw HTML.
 */

/**
 * Characters that require escaping in markdown inline text contexts.
 *
 * Only characters that trigger GFM inline parsing are escaped here.
 * Block-level triggers (`#`, `-`, `+`, `.` after digits, `!` before `[`)
 * are NOT escaped because our text is always placed into existing inline
 * contexts (headings, table cells, emphasis) where block-level parsing
 * has already been resolved.
 *
 * HTML characters are entity-encoded because GitHub Flavored Markdown
 * renders inline HTML — an unescaped `<script>` in markdown is XSS.
 *
 * Map values are the escaped replacement string.
 */
const ESCAPE_MAP: ReadonlyMap<string, string> = new Map([
  // HTML entities (security-critical — GitHub renders inline HTML)
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],

  // Markdown inline syntax characters (GFM spec sections 6.1–6.6)
  ["\\", "\\\\"], // backslash escape initiator
  ["`", "\\`"], // code span delimiter
  ["*", "\\*"], // emphasis / strong emphasis
  ["_", "\\_"], // emphasis / strong emphasis
  ["~", "\\~"], // strikethrough (GFM extension)
  ["[", "\\["], // link / image text start
  ["]", "\\]"], // link / image text end
  ["|", "\\|"], // GFM table cell delimiter
]);

/**
 * Escape characters that have special meaning in GitHub Flavored Markdown.
 *
 * Escapes both markdown formatting characters (backslash-prefixed) and
 * HTML characters (entity-encoded) to prevent markdown injection and
 * inline HTML rendering.
 *
 * This handles inline contexts only. For block contexts (e.g. blockquote
 * lines), call {@link markdownEscapeBlock} instead.
 */
export function markdownEscape(text: string): string {
  let result = "";
  for (const ch of text) {
    const replacement = ESCAPE_MAP.get(ch);
    result += replacement ?? ch;
  }
  return result;
}

/**
 * Escape text for a markdown block context (e.g. inside a blockquote line).
 *
 * Applies inline escaping first, then escapes any block-level triggers
 * that would be parsed at the start of the line. Only patterns that survive
 * inline escaping need handling here — `>` is already entity-encoded to
 * `&gt;` by inline escaping and `* ` becomes `\* ` which doesn't trigger
 * a list.
 */
export function markdownEscapeBlock(text: string): string {
  let escaped = markdownEscape(text);
  // Unordered list: `- ` / `+ ` → `\- ` / `\+ `
  escaped = escaped.replace(/^([-+])(?=[ \t])/, "\\$1");
  // Ordered list: `1. ` / `1) ` → `1\. ` / `1\) ` (digits aren't punctuation
  // so we escape the delimiter, not the digit)
  escaped = escaped.replace(/^(\d{1,9})([.)])(?=[ \t])/, "$1\\$2");
  // ATX heading: `# ` → `\# `
  escaped = escaped.replace(/^(#{1,6})(?=[ \t])/, "\\$1");
  return escaped;
}
