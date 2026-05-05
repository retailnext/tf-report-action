/**
 * Category elements — ReportElement classes for the three progressive-
 * enhancement categories: resources, outputs, and drift.
 *
 * Each has 5 levels matching the current tier system:
 * - Level 0 (tier 1): flat listing (emoji + address in code block)
 * - Level 1 (tier 2): module-grouped compact (no attributes)
 * - Level 2 (tier 3): + attribute tables without diffs
 * - Level 3 (tier 4): + character-level inline diffs
 * - Level 4 (tier 5): + full large-value blocks
 */

import type { Renderable, OutputFormat } from "../model/renderable.js";
import type { ReportElement } from "../renderable/types.js";
import type { ResourceChange } from "../model/resource.js";
import type { OutputChange } from "../model/output.js";
import type { DiffEntry } from "../diff/types.js";
import type { ApplyContext } from "./apply-context.js";
import type { ResourceRenderOptions } from "./resource.js";
import type { OutputRenderOptions } from "./outputs.js";
import {
  Heading,
  CodeBlock,
  Sequence,
  EMPTY,
} from "../renderable/primitives.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import { DRIFT_ICON } from "../model/status-icons.js";
import { groupByModule } from "./address.js";
import { buildModuleGroupRenderable } from "./module-group.js";
import { buildOutputsRenderable } from "./outputs.js";

/**
 * Resource changes category element with 5 progressive detail levels.
 */
export class ResourceCategoryElement implements ReportElement {
  readonly id = "resources";
  readonly fixed = false;
  readonly levels = 5;

  private readonly levelRenderables: Renderable[];

  constructor(
    resources: readonly ResourceChange[],
    options: ResourceRenderOptions,
    diffCache: Map<string, DiffEntry[]>,
    applyContextFn?: (address: string) => ApplyContext,
  ) {
    this.levelRenderables = buildResourceLevels(
      "Resource Changes",
      resources,
      options,
      diffCache,
      applyContextFn,
    );
  }

  size(format: OutputFormat, level: number): number {
    const r = this.levelRenderables[level];
    return r ? r.size(format) : 0;
  }

  render(format: OutputFormat, level: number): string {
    const r = this.levelRenderables[level];
    return r ? r.render(format) : "";
  }
}

/**
 * Drift category element with 5 progressive detail levels.
 */
export class DriftCategoryElement implements ReportElement {
  readonly fixed = false;
  readonly levels = 5;
  readonly id: string;

  private readonly levelRenderables: Renderable[];

  constructor(
    driftResources: readonly ResourceChange[],
    options: ResourceRenderOptions,
    diffCache: Map<string, DiffEntry[]>,
  ) {
    this.id = "drift";
    const heading = `${DRIFT_ICON} Resource Drift (${String(driftResources.length)} detected)`;
    this.levelRenderables = buildResourceLevels(
      heading,
      driftResources,
      options,
      diffCache,
    );
  }

  size(format: OutputFormat, level: number): number {
    const r = this.levelRenderables[level];
    return r ? r.size(format) : 0;
  }

  render(format: OutputFormat, level: number): string {
    const r = this.levelRenderables[level];
    return r ? r.render(format) : "";
  }
}

/**
 * Output changes category element with 5 progressive detail levels.
 */
export class OutputCategoryElement implements ReportElement {
  readonly id = "outputs";
  readonly fixed = false;
  readonly levels = 5;

  private readonly levelRenderables: Renderable[];

  constructor(
    outputs: readonly OutputChange[],
    options: OutputRenderOptions,
    diffCache: Map<string, DiffEntry[]>,
  ) {
    this.levelRenderables = buildOutputLevels(outputs, options, diffCache);
  }

  size(format: OutputFormat, level: number): number {
    const r = this.levelRenderables[level];
    return r ? r.size(format) : 0;
  }

  render(format: OutputFormat, level: number): string {
    const r = this.levelRenderables[level];
    return r ? r.render(format) : "";
  }
}

// ---------------------------------------------------------------------------
// Level builders
// ---------------------------------------------------------------------------

/** Builds all 5 levels for a resource category (resources or drift). */
function buildResourceLevels(
  headingText: string,
  resources: readonly ResourceChange[],
  options: ResourceRenderOptions,
  diffCache: Map<string, DiffEntry[]>,
  applyContextFn?: (address: string) => ApplyContext,
): Renderable[] {
  const moduleGroups = groupByModule(resources);

  // Level 0: flat listing
  const listingLines = resources.map(
    (r) => `${ACTION_SYMBOLS[r.action]} ${r.address}`,
  );
  const level0 = new Sequence([
    new Heading(headingText, 2),
    new CodeBlock(listingLines.join("\n")),
  ]);

  // Levels 1–4: module-grouped at progressive detail
  const levels: Renderable[] = [level0];
  for (let lvl = 1; lvl <= 4; lvl++) {
    const parts: Renderable[] = [new Heading(headingText, 2)];
    for (const mg of moduleGroups) {
      parts.push(
        buildModuleGroupRenderable(
          mg.moduleAddress,
          mg.resources,
          options,
          diffCache,
          lvl,
          applyContextFn,
        ),
      );
    }
    levels.push(new Sequence(parts));
  }

  return levels;
}

/** Builds all 5 levels for the outputs category. */
function buildOutputLevels(
  outputs: readonly OutputChange[],
  options: OutputRenderOptions,
  diffCache: Map<string, DiffEntry[]>,
): Renderable[] {
  // Level 0: flat listing
  const listingLines = outputs.map((o) => {
    const suffix = o.isSensitive ? " (sensitive)" : "";
    return `${ACTION_SYMBOLS[o.action]} ${o.name}${suffix}`;
  });
  const level0 = new Sequence([
    new Heading("Output Changes", 2),
    new CodeBlock(listingLines.join("\n")),
  ]);

  // Level 1: compact (same as listing for outputs since there's nothing between listing and attrs)
  const level1 = level0;

  // Levels 2–4: progressive attribute detail
  const levels: Renderable[] = [level0, level1];
  for (let lvl = 2; lvl <= 4; lvl++) {
    const content = buildOutputsRenderable(outputs, options, diffCache, lvl);
    if (content === EMPTY) {
      levels.push(level0);
    } else {
      levels.push(new Sequence([new Heading("Output Changes", 2), content]));
    }
  }

  return levels;
}
