/**
 * Budget-aware section compositor.
 *
 * Assembles markdown sections in order within an output size budget.
 * Uses a two-pass algorithm to ensure every flex section gets at least
 * its compact form before any section receives full detail.
 *
 * This module has zero internal project dependencies — it operates
 * purely on strings and the Section/CompositionResult interfaces.
 */

import type { Section, CompositionResult } from "./types.js";

/** Default maximum output length (63 KiB, leaving room within GitHub's 64K limit). */
export const DEFAULT_MAX_OUTPUT_LENGTH = 63 * 1024;

/** Per-section allocation decision from Pass 1. */
type Allocation = "full" | "compact" | "omitted";

/**
 * Compose sections into a single output string within a budget.
 *
 * Sections are processed in the order given. Fixed sections are always
 * included in full (they are never degraded or omitted). Non-fixed
 * (flex) sections are allocated using two passes:
 *
 * **Pass 1 — Compact allocation:** deduct fixed sections from budget,
 * then tentatively allocate compact size for each flex section (or full
 * if no compact variant exists). If neither fits, mark as omitted.
 *
 * **Pass 2 — Upgrade to full:** process flex sections in order and
 * upgrade from compact to full when the additional cost fits in the
 * remaining budget.
 *
 * This ensures that under budget pressure every flex section gets at
 * least its compact form (resource list visible) before any section
 * gets full detail.
 *
 * **Budget is best-effort**: if the total length of fixed sections alone
 * exceeds the budget, the output will exceed the budget because fixed
 * sections are unconditionally included. Callers that need a hard limit
 * should truncate the returned output.
 *
 * @param sections - Ordered list of sections to compose
 * @param budget - Maximum total output length in characters (best-effort)
 * @returns The composed result with degradation metadata
 */
export function composeSections(
  sections: readonly Section[],
  budget: number,
): CompositionResult {
  // Deduct fixed sections from budget
  let remaining = budget;
  for (const section of sections) {
    if (section.fixed === true) {
      remaining -= section.full.length;
    }
  }

  // Pass 1: allocate compact (or full when no compact) for each flex section
  const allocations: Allocation[] = [];
  for (const section of sections) {
    if (section.fixed === true) {
      allocations.push("full");
      continue;
    }

    if (section.compact !== undefined) {
      // Has a compact variant — try compact first
      if (section.compact.length <= remaining) {
        allocations.push("compact");
        remaining -= section.compact.length;
      } else {
        allocations.push("omitted");
      }
    } else {
      // No compact variant — full or omit
      if (section.full.length <= remaining) {
        allocations.push("full");
        remaining -= section.full.length;
      } else {
        allocations.push("omitted");
      }
    }
  }

  // Pass 2: upgrade compact → full where the delta fits
  for (let i = 0; i < sections.length; i++) {
    if (allocations[i] !== "compact") continue;
    const section = sections[i]!;
    const delta = section.full.length - (section.compact?.length ?? 0);
    if (delta <= remaining) {
      allocations[i] = "full";
      remaining -= delta;
    }
  }

  // Assemble output and collect degradation metadata
  const degradedIds: string[] = [];
  const omittedIds: string[] = [];
  const parts: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const alloc = allocations[i]!;

    if (alloc === "full") {
      parts.push(section.full);
    } else if (alloc === "compact") {
      parts.push(section.compact!);
      degradedIds.push(section.id);
    } else {
      omittedIds.push(section.id);
    }
  }

  return {
    output: parts.join(""),
    degradedCount: degradedIds.length,
    omittedCount: omittedIds.length,
    degradedIds,
    omittedIds,
    wasTruncated: degradedIds.length > 0 || omittedIds.length > 0,
  };
}

export type { Section, CompositionResult } from "./types.js";
