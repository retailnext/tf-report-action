import type { DriftRule } from "../registry.js";
import type { AttributeChange } from "../../model/attribute.js";

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
  attributes: AttributeChange[],
): boolean =>
  attributes.length > 0 && attributes.every((a) => a.name === "etag");
