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
 */
export function markdownEscape(text: string): string {
  let result = "";
  for (const ch of text) {
    const replacement = ESCAPE_MAP.get(ch);
    result += replacement ?? ch;
  }
  return result;
}
