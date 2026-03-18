/**
 * Types for the section compositor, which assembles markdown sections
 * within an output size budget.
 *
 * These are type-only re-exports from the model layer, ensuring a
 * single source of truth. The compositor has zero runtime dependencies
 * on the model — these are erased at compile time.
 */

export type { Section } from "../model/section.js";
export type { CompositionResult } from "../model/composition-result.js";
