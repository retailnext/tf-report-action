/**
 * Module group element — groups resources by module address and renders
 * them with a module heading.
 *
 * The module group itself is not a ReportElement (it doesn't have
 * independent levels). Instead, it produces a Renderable at a given
 * level that the category element wraps.
 */

import type { Renderable, OutputFormat } from "../model/renderable.js";
import type { ResourceChange } from "../model/resource.js";
import type { DiffEntry } from "../diff/types.js";
import type { ApplyContext } from "./apply-context.js";
import type { ResourceRenderOptions } from "./resource.js";
import { Sequence } from "../renderable/primitives.js";
import { MODULE_ICON } from "../model/status-icons.js";
import { htmlEscape } from "../renderable/html-escape.js";
import { renderNote, mdCodeSpan } from "../renderable/helpers.js";
import { buildResourceRenderable } from "./resource.js";

/**
 * Builds a Renderable for a module group at a specific detail level.
 *
 * @param moduleAddress - The module address ("" for root module)
 * @param resources - Resources in this module group
 * @param options - Render options (diff format, show unchanged)
 * @param diffCache - Cache for computed line diffs
 * @param level - Detail level (1=compact, 2=attrs-no-diff, 3=attrs-char-diff, 4=full)
 * @param applyContextFn - Optional function to get apply context per resource
 */
export function buildModuleGroupRenderable(
  moduleAddress: string,
  resources: readonly ResourceChange[],
  options: ResourceRenderOptions,
  diffCache: Map<string, DiffEntry[]>,
  level: number,
  applyContextFn?: (address: string) => ApplyContext,
): Renderable {
  const heading = new ModuleHeading(moduleAddress);
  const parts: Renderable[] = [heading];

  for (const resource of resources) {
    const applyContext = applyContextFn?.(resource.address);
    parts.push(
      buildResourceRenderable(
        resource,
        options,
        diffCache,
        level,
        applyContext,
      ),
    );
  }

  return new Sequence(parts);
}

/**
 * Builds a compact placeholder for a module group.
 * Used when the module group is degraded below its minimum detail level.
 */
export function buildModuleGroupCompact(moduleAddress: string): Renderable {
  return new CompactModuleGroup(moduleAddress);
}

// ---------------------------------------------------------------------------
// Internal Renderables
// ---------------------------------------------------------------------------

/**
 * Module heading with code-styled address per format.
 * Root modules render as "root" (no code styling).
 */
class ModuleHeading implements Renderable {
  private readonly moduleAddress: string;

  constructor(moduleAddress: string) {
    this.moduleAddress = moduleAddress;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    const label = this.renderLabel(format);
    if (format === "markdown") {
      return `### ${MODULE_ICON} Module: ${label}\n\n`;
    }
    return `<h3>${MODULE_ICON} Module: ${label}</h3>\n`;
  }

  private renderLabel(format: OutputFormat): string {
    if (this.moduleAddress === "") return "root";
    if (format === "markdown") {
      return mdCodeSpan(this.moduleAddress);
    }
    return `<code>${htmlEscape(this.moduleAddress)}</code>`;
  }
}

/**
 * Compact module group — heading + "details omitted" note.
 */
class CompactModuleGroup implements Renderable {
  private readonly moduleAddress: string;

  constructor(moduleAddress: string) {
    this.moduleAddress = moduleAddress;
  }

  size(format: OutputFormat): number {
    return (
      this.renderHeading(format).length +
      renderNote("details omitted", format).length
    );
  }

  render(format: OutputFormat): string {
    return this.renderHeading(format) + renderNote("details omitted", format);
  }

  private renderHeading(format: OutputFormat): string {
    const label =
      this.moduleAddress === ""
        ? "root"
        : format === "markdown"
          ? mdCodeSpan(this.moduleAddress)
          : `<code>${htmlEscape(this.moduleAddress)}</code>`;
    if (format === "markdown") {
      return `### ${label}\n\n`;
    }
    return `<h3>${label}</h3>\n`;
  }
}
