/**
 * Display-name derivation from fully-qualified resource addresses.
 *
 * These helpers are renderer-internal — they exist because module grouping
 * and instance-name display are rendering concerns, not model concerns.
 * Resources are identified solely by their `address`; the renderer derives
 * what it needs from `address` + `type`.
 */

/**
 * Derives the module address from a fully-qualified resource address.
 *
 * Uses `lastIndexOf` to locate `.{type}.` in the address, which marks the
 * boundary between the module path and the resource-local portion.
 * Root-module resources (whose address starts with `{type}.`) return `""`.
 *
 * @example
 * deriveModuleAddress("module.parent[\"1\"].module.child.null_resource.item[0]", "null_resource")
 *   // → "module.parent[\"1\"].module.child"
 * deriveModuleAddress("aws_instance.web", "aws_instance")
 *   // → ""
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
 *
 * @example
 * deriveInstanceName("module.child.null_resource.item[0]", "null_resource")
 *   // → "item[0]"
 * deriveInstanceName("aws_instance.web", "aws_instance")
 *   // → "web"
 * deriveInstanceName("module.m.aws_instance.db[\"primary\"]", "aws_instance")
 *   // → "db[\"primary\"]"
 */
export function deriveInstanceName(address: string, type: string): string {
  const typePrefix = `${type}.`;
  if (address.startsWith(typePrefix)) return address.slice(typePrefix.length);
  const dotType = `.${typePrefix}`;
  const idx = address.lastIndexOf(dotType);
  if (idx < 0) return address;
  return address.slice(idx + dotType.length);
}
