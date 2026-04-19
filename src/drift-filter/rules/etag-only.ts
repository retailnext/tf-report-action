import type { DriftRule } from "../registry.js";

/**
 * Suppresses drift for any resource type where the only changed attribute is `etag`.
 *
 * ETag changes reflect provider-internal versioning and are not meaningful as
 * infrastructure drift — they do not indicate a configuration divergence that
 * requires human attention.
 */
export const suppressEtagOnlyDrift: DriftRule = (
  _type: string,
  _mode: string,
  attributes,
): boolean => {
  const changed = attributes.filter((a) => a.before !== a.after);
  return changed.length > 0 && changed.every((a) => a.name === "etag");
};
