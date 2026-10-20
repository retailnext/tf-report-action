/**
 * Sentinel string constants used as special values in the Report model.
 * Both the builder (which sets them) and the renderer (which displays them)
 * import from this module so the contract stays in one place.
 */

/** Placeholder used when an attribute or output value is sensitive. */
export const SENSITIVE_MASK = "(sensitive)";

/**
 * Placeholder used as the `after` value of a sensitive attribute whose
 * underlying value changed, in the attribute list given to drift suppression
 * rules. It lets rules detect the change without seeing the value. It is
 * never rendered.
 */
export const SENSITIVE_CHANGED_MASK = "(sensitive, changed)";

/** Placeholder used when an attribute or output value will only be known after apply. */
export const KNOWN_AFTER_APPLY = "(known after apply)";

/**
 * Placeholder used in apply reports for attributes whose resolved value is not
 * available because the plan JSON only recorded `after_unknown: true`.
 */
export const VALUE_NOT_IN_PLAN = "(value not in plan)";
