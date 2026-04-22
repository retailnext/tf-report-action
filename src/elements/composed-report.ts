/**
 * ComposedReport implementation — budget-aware progressive enhancement.
 *
 * Takes an ordered array of ReportElement objects and implements the
 * ComposedReport interface: `render(format, limit?)` produces a
 * RenderResult by choosing optimal detail levels for each element.
 *
 * The progressive enhancement algorithm mirrors the two-phase approach
 * from `src/compose/progressive.ts` but operates on cached `size()`
 * values instead of rendering strings during planning:
 *
 * 1. **Uniform phase** — advance ALL flex elements together, level by
 *    level. Stop when any element cannot advance. The resulting level
 *    is the "floor".
 * 2. **Individual phase** — with remaining budget, upgrade individual
 *    flex elements beyond the floor in priority order (resources first,
 *    then outputs, then drift) to maximize useful information.
 */

import type {
  OutputFormat,
  ReportElement,
  RenderResult,
  ComposedReport,
} from "../renderable/types.js";

/**
 * Priority order for individual-phase upgrades.
 *
 * Resources are upgraded first (most useful), then outputs, then drift.
 * Elements not in this list receive no priority (upgraded last in
 * encounter order).
 */
const UPGRADE_PRIORITY: ReadonlyMap<string, number> = new Map([
  ["resources", 0],
  ["outputs", 1],
  ["drift", 2],
]);

/** Tracks a flex element's position and current level assignment. */
interface FlexEntry {
  /** Index into the elements array. */
  readonly idx: number;
  /** The element itself. */
  readonly el: ReportElement;
  /** Current assigned level (mutated during composition). */
  level: number;
}

/**
 * Create a ComposedReport from an ordered array of ReportElements.
 *
 * The elements array defines display order. Fixed elements (title,
 * summary, warnings, step issues) are always rendered at level 0.
 * Flex elements (resources, outputs, drift, text-fallback) are
 * rendered at the highest level that fits within the budget.
 */
export function composeReport(
  elements: readonly ReportElement[],
): ComposedReport {
  return new ComposedReportImpl(elements);
}

class ComposedReportImpl implements ComposedReport {
  private readonly elements: readonly ReportElement[];
  /** Flex entries for elements that can be degraded. */
  private readonly flexEntries: readonly FlexEntry[];

  constructor(elements: readonly ReportElement[]) {
    this.elements = elements;
    const flex: FlexEntry[] = [];
    for (const [idx, el] of elements.entries()) {
      if (!el.fixed && el.levels > 1) {
        flex.push({ idx, el, level: 0 });
      }
    }
    this.flexEntries = flex;
  }

  fullSize(format: OutputFormat): number {
    let total = 0;
    for (const el of this.elements) {
      total += el.size(format, el.levels - 1);
    }
    return total;
  }

  render(format: OutputFormat, limit?: number): RenderResult {
    const maxLevels = this.elements.map((el) => el.levels - 1);

    if (limit === undefined || limit === Infinity) {
      return this.renderAtLevels(format, maxLevels, false);
    }

    // Compute fixed cost — elements that cannot be degraded
    let fixedCost = 0;
    for (const el of this.elements) {
      if (el.fixed || el.levels <= 1) {
        fixedCost += el.size(format, el.levels - 1);
      }
    }

    // If no flex elements, render everything at max
    if (this.flexEntries.length === 0) {
      return this.renderAtLevels(format, maxLevels, false);
    }

    // Start all flex elements at level 0
    const levels = [...maxLevels];
    const entries = this.flexEntries.map((e) => ({ ...e, level: 0 }));
    for (const entry of entries) {
      levels[entry.idx] = 0;
    }

    // Check if even level-0 fits
    let currentTotal = this.totalSize(format, levels);
    if (currentTotal > limit) {
      return this.renderAtLevels(format, levels, true);
    }

    // Phase 1 (uniform): advance ALL flex elements together
    let maxFlexLevel = 0;
    for (const entry of entries) {
      const ml = entry.el.levels - 1;
      if (ml > maxFlexLevel) maxFlexLevel = ml;
    }

    for (let targetLevel = 1; targetLevel <= maxFlexLevel; targetLevel++) {
      let candidateTotal = fixedCost;
      const candidateLevels: number[] = [];

      for (const entry of entries) {
        const newLevel = Math.min(targetLevel, entry.el.levels - 1);
        candidateLevels.push(newLevel);
        candidateTotal += entry.el.size(format, newLevel);
      }

      // Add single-level flex elements (levels <= 1, not in entries)
      for (const el of this.elements) {
        if (!el.fixed && el.levels <= 1) {
          candidateTotal += el.size(format, 0);
        }
      }

      if (candidateTotal <= limit) {
        for (const [i, entry] of entries.entries()) {
          const cl = candidateLevels[i];
          if (cl !== undefined) {
            entry.level = cl;
            levels[entry.idx] = cl;
          }
        }
        currentTotal = candidateTotal;
      } else {
        break;
      }
    }

    // Phase 2 (individual): upgrade flex elements beyond the floor
    const sortedEntries = [...entries].sort((a, b) => {
      const pa = UPGRADE_PRIORITY.get(a.el.id) ?? 99;
      const pb = UPGRADE_PRIORITY.get(b.el.id) ?? 99;
      if (pa !== pb) return pa - pb;
      return a.idx - b.idx;
    });

    for (const entry of sortedEntries) {
      const maxLevel = entry.el.levels - 1;

      for (
        let targetLevel = entry.level + 1;
        targetLevel <= maxLevel;
        targetLevel++
      ) {
        const oldSize = entry.el.size(format, entry.level);
        const newSize = entry.el.size(format, targetLevel);
        const delta = newSize - oldSize;

        if (currentTotal + delta <= limit) {
          entry.level = targetLevel;
          levels[entry.idx] = targetLevel;
          currentTotal += delta;
        } else {
          break;
        }
      }
    }

    const truncated = entries.some(
      (entry) => entry.level < entry.el.levels - 1,
    );

    return this.renderAtLevels(format, levels, truncated);
  }

  /** Compute total size for all elements at given levels. */
  private totalSize(format: OutputFormat, levels: readonly number[]): number {
    let total = 0;
    for (const [i, el] of this.elements.entries()) {
      const level = levels[i];
      if (level !== undefined) {
        total += el.size(format, level);
      }
    }
    return total;
  }

  /** Render all elements at given levels, concatenating the output. */
  private renderAtLevels(
    format: OutputFormat,
    levels: readonly number[],
    truncated: boolean,
  ): RenderResult {
    const parts: string[] = [];
    for (const [i, el] of this.elements.entries()) {
      const level = levels[i];
      if (level !== undefined) {
        const rendered = el.render(format, level);
        if (rendered.length > 0) {
          parts.push(rendered);
        }
      }
    }
    return { output: parts.join(""), truncated };
  }
}
