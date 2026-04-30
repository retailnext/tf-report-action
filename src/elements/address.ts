/**
 * Display-name derivation from fully-qualified resource addresses.
 *
 * These helpers exist because module grouping and instance-name display
 * are rendering concerns, not model concerns. Resources are identified
 * solely by their `address`; the element layer derives what it needs
 * from `address` + `type`.
 */

import type { ResourceChange } from "../model/resource.js";

/**
 * Derives the module address from a fully-qualified resource address.
 *
 * Uses `lastIndexOf` to locate `.{type}.` in the address, which marks the
 * boundary between the module path and the resource-local portion.
 * Root-module resources (whose address starts with `{type}.`) return `""`.
 */
export function deriveModuleAddress(address: string, type: string): string {
  const typePrefix = `${type}.`;
  if (address.startsWith(typePrefix)) return "";
  const dotType = `.${typePrefix}`;
  const idx = address.lastIndexOf(dotType);
  if (idx < 0) return "";
  return address.slice(0, idx);
}

/**
 * Derives the instance name (with key suffix) from a fully-qualified
 * resource address by stripping the module prefix and type prefix.
 */
export function deriveInstanceName(address: string, type: string): string {
  const typePrefix = `${type}.`;
  if (address.startsWith(typePrefix)) return address.slice(typePrefix.length);
  const dotType = `.${typePrefix}`;
  const idx = address.lastIndexOf(dotType);
  if (idx < 0) return address;
  return address.slice(idx + dotType.length);
}

/**
 * Lightweight grouping structure for display.
 * Module grouping is a rendering concern, not a model concern.
 */
export interface ModuleGroup {
  readonly moduleAddress: string;
  readonly resources: ResourceChange[];
}

/**
 * Groups a flat resource array by derived module address for display.
 * Sorted: root module first, then alphabetical by module address.
 */
export function groupByModule(
  resources: readonly ResourceChange[],
): ModuleGroup[] {
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
