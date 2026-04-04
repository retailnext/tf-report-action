/**
 * Category-level rendering at a specified tier.
 *
 * Given a report's category data (resources, outputs, drift) and a target
 * tier, produces the markdown for that category at the requested detail
 * level. This bridges the progressive upgrade algorithm and the renderer.
 */

import type { Report } from "../model/report.js";
import type { RenderOptions } from "../model/render-options.js";
import type { ResourceRenderMode } from "../renderer/render-mode.js";
import type { DiffEntry } from "../diff/types.js";
import { MarkdownWriter } from "../renderer/writer.js";
import {
  groupByModule,
  renderModuleSection,
} from "../renderer/module-section.js";
import { buildApplyContextFn } from "../renderer/apply-context.js";
import { renderOutputs } from "../renderer/outputs.js";
import { ensureTrailingBlankLine } from "../renderer/index.js";
import { DRIFT_ICON } from "../model/status-icons.js";
import { renderResourceListing, renderOutputListing } from "./listing.js";

/** The progressive enhancement tiers in upgrade order. */
export type Tier = 1 | 2 | 3 | 4 | 5;

/** Maps a tier to the corresponding ResourceRenderMode. */
function tierToMode(tier: Tier): ResourceRenderMode {
  switch (tier) {
    case 1:
      return "compact";
    case 2:
      return "compact";
    case 3:
      return "attrs-no-diff";
    case 4:
      return "attrs-char-diff";
    case 5:
      return "full";
  }
}

/** Content categories in priority order. */
export type Category = "resources" | "outputs" | "drift";

/**
 * Renders a category at the specified tier.
 *
 * - Tier 1: flat listing (emoji + address, no module grouping)
 * - Tier 2: module-grouped compact (no attributes)
 * - Tier 3-5: module-grouped with progressively richer attribute detail
 *
 * @returns Markdown string for the category, or empty string if no data
 */
export function renderCategoryAtTier(
  category: Category,
  tier: Tier,
  report: Report,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
): string {
  switch (category) {
    case "resources":
      return renderResourcesAtTier(tier, report, options, diffCache);
    case "outputs":
      return renderOutputsAtTier(tier, report, options, diffCache);
    case "drift":
      return renderDriftAtTier(tier, report, options, diffCache);
  }
}

/** Renders resource changes at the specified tier. */
function renderResourcesAtTier(
  tier: Tier,
  report: Report,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
): string {
  const resources = report.resources ?? [];
  if (resources.length === 0) return "";

  if (tier === 1) {
    return renderResourceListing("Resource Changes", resources);
  }

  const mode = tierToMode(tier);
  const moduleGroups = groupByModule(resources);
  const applyContextFn = buildApplyContextFn(report);

  const writer = new MarkdownWriter();
  writer.heading("Resource Changes", 2);
  for (const moduleGroup of moduleGroups) {
    renderModuleSection(
      moduleGroup,
      writer,
      options,
      diffCache,
      mode,
      applyContextFn,
    );
  }
  return ensureTrailingBlankLine(writer.build());
}

/** Renders output changes at the specified tier. */
function renderOutputsAtTier(
  tier: Tier,
  report: Report,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
): string {
  const outputs = report.outputs ?? [];
  if (outputs.length === 0) return "";

  if (tier === 1) {
    return renderOutputListing("Output Changes", outputs);
  }

  const mode = tierToMode(tier);
  const writer = new MarkdownWriter();
  writer.heading("Output Changes", 2);
  renderOutputs(outputs, writer, options, diffCache, mode);
  return ensureTrailingBlankLine(writer.build());
}

/** Renders drift at the specified tier. */
function renderDriftAtTier(
  tier: Tier,
  report: Report,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
): string {
  const driftResources = report.driftResources ?? [];
  if (driftResources.length === 0) return "";

  if (tier === 1) {
    return renderResourceListing(
      `${DRIFT_ICON} Resource Drift (${String(driftResources.length)} detected)`,
      driftResources,
    );
  }

  const mode = tierToMode(tier);
  const moduleGroups = groupByModule(driftResources);

  const writer = new MarkdownWriter();
  writer.heading(
    `${DRIFT_ICON} Resource Drift (${String(driftResources.length)} detected)`,
    2,
  );
  for (const moduleGroup of moduleGroups) {
    renderModuleSection(moduleGroup, writer, options, diffCache, mode);
  }
  return ensureTrailingBlankLine(writer.build());
}
