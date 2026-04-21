/**
 * HTML escaping utilities with size estimation.
 *
 * These functions support the renderable architecture's requirement that
 * `size()` returns exact character counts without allocating the escaped
 * string. The `htmlEscapeSize` function scans for characters needing
 * entity encoding and returns the resulting length.
 */

/** Characters requiring HTML entity encoding and their replacement lengths. */
const ENTITY_MAP: ReadonlyMap<string, number> = new Map([
  ["&", 5], // &amp;
  ["<", 4], // &lt;
  [">", 4], // &gt;
  ['"', 6], // &quot;
]);

/**
 * Compute the character length of HTML-escaped text without allocating
 * the escaped string.
 *
 * Scans for `&`, `<`, `>`, `"` and accounts for entity expansion.
 * All other characters pass through at length 1.
 */
export function htmlEscapeSize(text: string): number {
  let size = 0;
  for (const ch of text) {
    const entityLen = ENTITY_MAP.get(ch);
    size += entityLen ?? 1;
  }
  return size;
}

/**
 * Escape characters that have special meaning in HTML.
 *
 * Replaces `&`, `<`, `>`, `"` with their entity equivalents.
 */
export function htmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
