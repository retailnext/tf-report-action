/**
 * Progressive composition entry point.
 *
 * Replaces the compositor's generic two-pass algorithm for
 * `reportFromSteps` with a category-aware progressive enhancement
 * pipeline that guarantees every resource is listed before any
 * attribute diffs are shown.
 *
 * For structured reports with resources/outputs/drift, the
 * progressive composer re-renders categories at escalating tiers.
 * For non-structured reports (error, text fallback, workflow),
 * section content is concatenated directly (budget-truncated).
 */

import type { Report } from "../model/report.js";
import type { Section } from "../model/section.js";
import type { RenderOptions } from "../model/render-options.js";
import { composeProgressively } from "./progressive.js";

/** Result of budget-aware composition. */
export interface ComposeResult {
  /** Budget-constrained markdown output. */
  readonly markdown: string;
  /** Whether any content was degraded or truncated to fit the budget. */
  readonly wasTruncated: boolean;
}

/**
 * Compose a report's rendered sections within a budget.
 *
 * For structured reports (resources, outputs, or drift), separates
 * fixed content (title, summary, diagnostics) from category content
 * (which the progressive algorithm re-renders at escalating tiers).
 * For non-structured reports, concatenates all sections directly.
 */
export function composeWithBudget(
  sections: readonly Section[],
  report: Report,
  options: RenderOptions,
  budget: number,
): ComposeResult {
  const hasCategories =
    (report.resources?.length ?? 0) > 0 ||
    (report.outputs?.length ?? 0) > 0 ||
    (report.driftResources?.length ?? 0) > 0;

  if (hasCategories) {
    const { prefix, suffix } = splitAroundCategories(sections);
    return composeProgressively(prefix, suffix, report, options, budget);
  }

  // Non-structured: concatenate all sections, hard-truncate if needed
  const full = sections.map((s) => s.full).join("");
  if (full.length <= budget) {
    return { markdown: full, wasTruncated: false };
  }
  return { markdown: full.slice(0, budget), wasTruncated: true };
}

/**
 * Tests whether a section belongs to a progressive category.
 *
 * Category sections (resource modules, drift modules, output changes,
 * and their headings) are re-rendered by the progressive composer at
 * escalating tiers. All other sections pass through as fixed content.
 */
function isCategorySection(section: Section): boolean {
  const { id } = section;
  return (
    id === "resource-changes-heading" ||
    id === "drift-heading" ||
    id === "outputs" ||
    id.startsWith("module-") ||
    id.startsWith("drift-module-")
  );
}

/**
 * Splits sections into content before and after the category block.
 *
 * Sections before the first category section become `prefix` (title,
 * summary, diagnostics). Sections after the last category section
 * become `suffix` (raw stdout blocks, step tables). Category sections
 * themselves are discarded — the progressive composer re-renders them.
 */
function splitAroundCategories(sections: readonly Section[]): {
  prefix: string;
  suffix: string;
} {
  let firstCat = -1;
  let lastCat = -1;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s !== undefined && isCategorySection(s)) {
      if (firstCat === -1) firstCat = i;
      lastCat = i;
    }
  }

  const prefix = sections
    .slice(0, firstCat === -1 ? sections.length : firstCat)
    .map((s) => s.full)
    .join("");
  const suffix =
    lastCat === -1
      ? ""
      : sections
          .slice(lastCat + 1)
          .map((s) => s.full)
          .join("");

  return { prefix, suffix };
}

export { type ProgressiveResult } from "./progressive.js";
export {
  renderCategoryAtTier,
  type Category,
  type Tier,
} from "./category-renderer.js";
export { renderResourceListing, renderOutputListing } from "./listing.js";
export {
  buildTruncationNotice,
  buildLogsNotice,
  buildArtifactNotice,
  type NoticeLink,
} from "./notices.js";
