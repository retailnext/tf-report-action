/**
 * Progressive enhancement algorithm.
 *
 * Assembles report output by starting at the most compact tier and
 * progressively upgrading categories until the budget is exhausted.
 *
 * Upgrade rules:
 * 1. ALL categories must reach tier N before ANY upgrades to N+1.
 * 2. Within a tier, priority order: resources → outputs → drift.
 * 3. Fixed content (title, summary, diagnostics) is always included.
 */

import type { Report } from "../model/report.js";
import type { RenderOptions } from "../model/render-options.js";
import type { DiffEntry } from "../diff/types.js";
import {
  renderCategoryAtTier,
  type Category,
  type Tier,
} from "./category-renderer.js";

/** Categories in upgrade priority order (resources enhanced first). */
const UPGRADE_PRIORITY: readonly Category[] = ["resources", "outputs", "drift"];

/** Categories in display order (matches renderer: drift → resources → outputs). */
const DISPLAY_ORDER: readonly Category[] = ["drift", "resources", "outputs"];

/** Tiers in upgrade order. */
const TIERS: readonly Tier[] = [1, 2, 3, 4, 5];

/** Result of progressive composition. */
export interface ProgressiveResult {
  /** The composed markdown output, within budget. */
  readonly markdown: string;
  /** Whether any category was rendered below tier 5 (full). */
  readonly wasTruncated: boolean;
}

/**
 * Compose a report progressively within the given budget.
 *
 * @param prefix - Markdown before categories (title, summary, etc.)
 * @param suffix - Markdown after categories (raw stdout blocks, etc.)
 * @param report - The report data to render flex categories from
 * @param options - Render options
 * @param budget - Maximum total output length in characters
 * @returns The composed markdown and whether truncation occurred
 */
export function composeProgressively(
  prefix: string,
  suffix: string,
  report: Report,
  options: RenderOptions,
  budget: number,
): ProgressiveResult {
  const diffCache = new Map<string, DiffEntry[]>();
  const fixedLen = prefix.length + suffix.length;

  // Determine which categories have content
  const activeCategories = UPGRADE_PRIORITY.filter((c) =>
    categoryHasContent(c, report),
  );

  if (activeCategories.length === 0) {
    return { markdown: prefix + suffix, wasTruncated: false };
  }

  // Track current tier per category
  const tierMap = new Map<Category, Tier>();
  const contentMap = new Map<Category, string>();
  for (const cat of activeCategories) {
    tierMap.set(cat, 1);
    contentMap.set(cat, "");
  }

  // Render all categories at tier 1
  for (const cat of activeCategories) {
    contentMap.set(
      cat,
      renderCategoryAtTier(cat, 1, report, options, diffCache),
    );
  }

  // Try upgrading through tiers 2-5 (in upgrade priority order)
  for (const targetTier of TIERS.slice(1)) {
    for (const cat of activeCategories) {
      const currentTier = tierMap.get(cat) ?? 1;
      if (currentTier >= targetTier) continue;

      const candidateContent = renderCategoryAtTier(
        cat,
        targetTier,
        report,
        options,
        diffCache,
      );

      // Check if upgrading this category still fits the budget
      const otherContent = totalContentExcluding(contentMap, cat);
      const totalSize = fixedLen + otherContent + candidateContent.length;

      if (totalSize <= budget) {
        tierMap.set(cat, targetTier);
        contentMap.set(cat, candidateContent);
      }
    }
  }

  // Assemble: prefix + categories in display order + suffix
  const parts = [prefix];
  for (const cat of DISPLAY_ORDER) {
    const content = contentMap.get(cat);
    if (content) parts.push(content);
  }
  parts.push(suffix);

  const markdown = parts.join("");
  const wasTruncated = activeCategories.some(
    (cat) => (tierMap.get(cat) ?? 1) < 5,
  );

  return { markdown, wasTruncated };
}

/** Returns true if a category has any content in the report. */
function categoryHasContent(category: Category, report: Report): boolean {
  switch (category) {
    case "resources":
      return (report.resources ?? []).length > 0;
    case "outputs":
      return (report.outputs ?? []).length > 0;
    case "drift":
      return (report.driftResources ?? []).length > 0;
  }
}

/** Sums the content length of all categories except the excluded one. */
function totalContentExcluding(
  contentMap: Map<Category, string>,
  exclude: Category,
): number {
  let total = 0;
  for (const [cat, content] of contentMap) {
    if (cat !== exclude) total += content.length;
  }
  return total;
}
