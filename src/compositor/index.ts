/**
 * Budget-aware section compositor.
 *
 * Assembles markdown sections in order within an output size budget,
 * progressively degrading from full → compact → omit as needed.
 *
 * This module has zero internal project dependencies — it operates
 * purely on strings and the Section/CompositionResult interfaces.
 */

import type { Section, CompositionResult } from "./types.js";

/** Default maximum output length (63 KiB, leaving room within GitHub's 64K limit). */
export const DEFAULT_MAX_OUTPUT_LENGTH = 63 * 1024;

/**
 * Compose sections into a single output string within a budget.
 *
 * Sections are processed in the order given. Fixed sections are always
 * included. Non-fixed sections use their full content if budget allows,
 * compact content if under pressure, or are omitted if neither fits.
 *
 * @param sections - Ordered list of sections to compose
 * @param budget - Maximum total output length in characters
 * @returns The composed result with degradation metadata
 */
export function composeSections(
  sections: readonly Section[],
  budget: number,
): CompositionResult {
  // First pass: deduct fixed sections from budget
  let remaining = budget;
  for (const section of sections) {
    if (section.fixed === true) {
      remaining -= section.full.length;
    }
  }

  // Second pass: decide full/compact/omit for each flex section
  const degradedIds: string[] = [];
  const omittedIds: string[] = [];
  const parts: string[] = [];

  for (const section of sections) {
    if (section.fixed === true) {
      parts.push(section.full);
      continue;
    }

    // Try full content first
    if (section.full.length <= remaining) {
      parts.push(section.full);
      remaining -= section.full.length;
      continue;
    }

    // Try compact content
    if (section.compact !== undefined && section.compact.length <= remaining) {
      parts.push(section.compact);
      remaining -= section.compact.length;
      degradedIds.push(section.id);
      continue;
    }

    // Cannot fit — omit
    omittedIds.push(section.id);
  }

  return {
    output: parts.join(""),
    degradedCount: degradedIds.length,
    omittedCount: omittedIds.length,
    degradedIds,
    omittedIds,
  };
}

export type { Section, CompositionResult } from "./types.js";
