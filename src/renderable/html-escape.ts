/**
 * HTML escaping utilities.
 *
 * These functions support the renderable architecture's requirement that
 * all user-supplied text is entity-encoded before being emitted in HTML
 * contexts.
 */

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
