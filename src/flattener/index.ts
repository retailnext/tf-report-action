/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

import type { JsonValue } from "../tfjson/common.js";

/**
 * Flattens a nested JSON value into a flat map with dotted-path notation.
 * Object keys use "key" prefixes with ".", array indices use "[N]" notation.
 * Null values are stored as null in the map.
 *
 * @example
 * flatten({ a: [{ b: "x" }] }) // => Map { "a[0].b" => "x" }
 */
export function flatten(value: JsonValue): Map<string, string | null> {
  const result = new Map<string, string | null>();
  flattenInto(value, "", result);
  return result;
}

function flattenInto(
  value: JsonValue,
  prefix: string,
  result: Map<string, string | null>,
): void {
  if (value === null) {
    result.set(prefix, null);
  } else if (typeof value === "string") {
    result.set(prefix, value);
  } else if (typeof value === "number") {
    result.set(prefix, String(value));
  } else if (typeof value === "boolean") {
    result.set(prefix, value ? "true" : "false");
  } else if (Array.isArray(value)) {
    if (value.length === 0 && prefix !== "") {
      // Empty array at a non-root path — emit nothing. An empty array
      // means "no items" (absence), unlike {} which means "block present."
    } else {
      const sizeBefore = result.size;
      for (let i = 0; i < value.length; i++) {
        const child = value[i];
        if (child !== undefined) {
          flattenInto(
            child,
            prefix === "" ? `[${String(i)}]` : `${prefix}[${String(i)}]`,
            result,
          );
        }
      }
      // If the array had elements but none produced entries (e.g. all
      // children are empty arrays/objects), emit a presence marker so
      // the addition/removal of the array content is visible.
      if (prefix !== "" && result.size === sizeBefore && value.length > 0) {
        result.set(prefix, "{}");
      }
    }
  } else {
    // object
    const entries = Object.entries(value);
    if (entries.length === 0 && prefix !== "") {
      // Empty object represents an empty block — emit as a leaf so
      // additions/removals of empty blocks are visible in the diff.
      result.set(prefix, "{}");
    } else {
      const sizeBefore = result.size;
      for (const [key, child] of entries) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: JSON.parse can produce objects with undefined values at runtime
        if (child !== undefined) {
          flattenInto(child, prefix === "" ? key : `${prefix}.${key}`, result);
        }
      }
      // Emit a presence marker when either:
      // - No children produced entries (all empty arrays/objects), OR
      // - All produced entries are null (all-null attributes ≈ empty block)
      // This ensures { attr: null } and {} are both visible at the parent
      // level, so drift comparison naturally treats them as equivalent.
      if (prefix !== "" && allChildEntriesNullOrAbsent(result, sizeBefore)) {
        result.set(prefix, "{}");
      }
    }
  }
}

/**
 * Returns true if all entries added to `result` since `sizeBefore` are null,
 * OR if no entries were added at all. Used to detect objects whose children
 * are semantically empty (all null or all absent), warranting a presence marker.
 */
function allChildEntriesNullOrAbsent(
  result: Map<string, string | null>,
  sizeBefore: number,
): boolean {
  if (result.size === sizeBefore) return true;
  const entries = [...result.entries()].slice(sizeBefore);
  return entries.every(([, v]) => v === null);
}
