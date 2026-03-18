/**
 * Named constants for every emoji and symbol used in rendered output
 * that is not an action symbol (those live in `ACTION_SYMBOLS`).
 *
 * All non-action emoji/symbols **must** be defined here so the
 * emoji-uniqueness and emoji-lint tests can verify consistency.
 */

/** Shown next to a resource that was successfully applied. */
export const STATUS_SUCCESS = "✅";

/** Shown next to a resource whose apply failed. */
export const STATUS_FAILURE = "❌";

/** Prefix for error-severity diagnostics. */
export const DIAGNOSTIC_ERROR = "🚨";

/** Prefix for warning-severity diagnostics. */
export const DIAGNOSTIC_WARNING = "⚠️";

/** Prefix for module group headings. */
export const MODULE_ICON = "📦";

/** Prefix for the resource drift section heading. */
export const DRIFT_ICON = "🔀";
