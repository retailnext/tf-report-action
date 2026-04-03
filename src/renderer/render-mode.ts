/**
 * Controls how much detail a resource or output is rendered with.
 *
 * Used by the progressive composition pipeline to request different
 * levels of detail from the renderer. Each tier adds information on
 * top of the previous one:
 *
 * - `"compact"` — summary line + address, import/moved metadata,
 *   diagnostics. No attribute table, no large-value diffs.
 * - `"attrs-no-diff"` — adds the small-attribute table with plain
 *   `<code>` cells (no character-level diffing). Large attributes
 *   rendered as context diffs (~3 lines of context per hunk).
 * - `"attrs-char-diff"` — small-attribute table gains character-level
 *   `<ins>`/`<del>` inline diffs. Large attributes still context diffs.
 * - `"full"` — current behavior: character-level diffs in the table,
 *   large attributes shown in full (all lines).
 */
export type ResourceRenderMode =
  | "compact"
  | "attrs-no-diff"
  | "attrs-char-diff"
  | "full";
