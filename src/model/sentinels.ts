/**
 * Sentinel string constants used as special values in the Report model.
 * Both the builder (which sets them) and the renderer (which displays them)
 * import from this module so the contract stays in one place.
 */

/** Placeholder used when an attribute or output value is sensitive. */
export const SENSITIVE_MASK = "(sensitive)";

/** Placeholder used when an attribute or output value will only be known after apply. */
export const KNOWN_AFTER_APPLY = "(known after apply)";
