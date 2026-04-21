/**
 * Module group element — groups resources by module address and renders
 * them with a module heading.
 *
 * The module group itself is not a ReportElement (it doesn't have
 * independent levels). Instead, it produces a Renderable at a given
 * level that the category element wraps.
 */

import type { Renderable } from "../renderable/types.js";
import type { ResourceChange } from "../model/resource.js";
import type { DiffEntry } from "../diff/types.js";
import type { ApplyContext } from "./apply-context.js";
import type { ResourceRenderOptions } from "./resource.js";
import { Heading, Sequence, Paragraph } from "../renderable/primitives.js";
import { MODULE_ICON } from "../model/status-icons.js";
import { moduleLabel } from "./address.js";
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
  const label = moduleLabel(moduleAddress);
  const parts: Renderable[] = [
    new Heading(`${MODULE_ICON} Module: ${label}`, 3),
  ];

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
  const label = moduleLabel(moduleAddress);
  return new Sequence([
    new Heading(label, 3),
    new Paragraph("_(details omitted)_"),
  ]);
}
