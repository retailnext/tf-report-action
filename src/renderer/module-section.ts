import type { ResourceChange } from "../model/resource.js";
import type { RenderOptions } from "./options.js";
import type { ResourceRenderMode } from "./render-mode.js";
import type { DiffEntry } from "../diff/types.js";
import type { ApplyContext } from "./apply-context.js";
import { MarkdownWriter } from "./writer.js";
import { renderResource } from "./resource.js";
import { MODULE_ICON } from "../model/status-icons.js";
import { deriveModuleAddress } from "./address.js";

/**
 * Lightweight grouping structure used only within the renderer.
 * Not part of the public model — module grouping is a display concern.
 */
export interface RendererModuleGroup {
  readonly moduleAddress: string;
  readonly resources: ResourceChange[];
}

/**
 * Groups a flat resource array by derived module address for display.
 * Sorted: root module first, then alphabetical by module address.
 */
export function groupByModule(
  resources: readonly ResourceChange[],
): RendererModuleGroup[] {
  const map = new Map<string, ResourceChange[]>();

  for (const resource of resources) {
    const moduleAddr = deriveModuleAddress(resource.address, resource.type);
    let group = map.get(moduleAddr);
    if (!group) {
      group = [];
      map.set(moduleAddr, group);
    }
    group.push(resource);
  }

  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === "") return -1;
      if (b === "") return 1;
      return a.localeCompare(b);
    })
    .map(([moduleAddress, grouped]) => ({ moduleAddress, resources: grouped }));
}

/** Formats a module address into its display label. */
export function moduleLabel(moduleAddress: string): string {
  return moduleAddress === "" ? "root" : `\`${moduleAddress}\``;
}

/**
 * Renders a single module group as a headed section with each resource
 * rendered at the specified detail level.
 *
 * When `applyContextFn` is provided, each resource receives its
 * apply-specific failure/diagnostic context.
 */
export function renderModuleSection(
  moduleGroup: RendererModuleGroup,
  writer: MarkdownWriter,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
  mode: ResourceRenderMode,
  applyContextFn?: (address: string) => ApplyContext,
): void {
  const label = moduleLabel(moduleGroup.moduleAddress);
  writer.heading(`${MODULE_ICON} Module: ${label}`, 3);

  for (const resource of moduleGroup.resources) {
    const applyContext = applyContextFn?.(resource.address);
    renderResource(resource, writer, options, diffCache, mode, applyContext);
  }
}
