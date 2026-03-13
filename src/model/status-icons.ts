/**
 * Named constants for status indicator emojis used in apply reports
 * and diagnostics. Centralised here so the emoji-uniqueness test can
 * verify no symbol is reused across action symbols and status indicators.
 */

/** Shown next to a resource that was successfully applied. */
export const STATUS_SUCCESS = "✅";

/** Shown next to a resource whose apply failed. */
export const STATUS_FAILURE = "❌";

/** Prefix for error-severity diagnostics. */
export const DIAGNOSTIC_ERROR = "🚨";

/** Prefix for warning-severity diagnostics. */
export const DIAGNOSTIC_WARNING = "⚠️";
