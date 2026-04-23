/**
 * Shared rendering helper functions for format-aware output patterns
 * that are common across multiple semantic Renderables.
 *
 * These are NOT Renderable classes — they are pure functions that
 * produce format-specific strings. They exist to avoid duplicating
 * the same format-switching logic across multiple element files.
 */

import type { OutputFormat } from "./types.js";
import { htmlEscape } from "./html-escape.js";

/**
 * Renders a contextual note — italic in markdown, `<em>` in HTML.
 *
 * Used by owning Renderables for their "no data" / "omitted" states.
 */
export function renderNote(text: string, format: OutputFormat): string {
  return format === "markdown"
    ? `_${text}_\n\n`
    : `<p><em>${htmlEscape(text)}</em></p>\n`;
}

/**
 * Computes the size of a rendered note for the given format.
 */
export function noteSize(text: string, format: OutputFormat): number {
  return renderNote(text, format).length;
}
