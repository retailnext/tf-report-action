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

/**
 * Recursively flattens a JSON value into `result`. Returns true if any
 * non-null entry was emitted, allowing callers to detect "all-null" subtrees
 * without rescanning the map.
 */
function flattenInto(
  value: JsonValue,
  prefix: string,
  result: Map<string, string | null>,
): boolean {
  if (value === null) {
    result.set(prefix, null);
    return false;
  } else if (typeof value === "string") {
    result.set(prefix, value);
    return true;
  } else if (typeof value === "number") {
    result.set(prefix, String(value));
    return true;
  } else if (typeof value === "boolean") {
    result.set(prefix, value ? "true" : "false");
    return true;
  } else if (Array.isArray(value)) {
    if (value.length === 0 && prefix !== "") {
      // Empty array at a non-root path — emit nothing. An empty array
      // means "no items" (absence), unlike {} which means "block present."
      return false;
    }
    let emittedNonNull = false;
    for (let i = 0; i < value.length; i++) {
      const child = value[i];
      if (child !== undefined) {
        const childResult = flattenInto(
          child,
          prefix === "" ? `[${String(i)}]` : `${prefix}[${String(i)}]`,
          result,
        );
        emittedNonNull = emittedNonNull || childResult;
      }
    }
    // If the array had elements but none produced non-null entries,
    // emit a presence marker so the addition/removal is visible.
    if (prefix !== "" && !emittedNonNull && value.length > 0) {
      result.set(prefix, "{}");
      return true;
    }
    return emittedNonNull;
  } else {
    // object
    const entries = Object.entries(value);
    if (entries.length === 0 && prefix !== "") {
      // Empty object represents an empty block — emit as a leaf so
      // additions/removals of empty blocks are visible in the diff.
      result.set(prefix, "{}");
      return true;
    }
    let emittedNonNull = false;
    for (const [key, child] of entries) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: JSON.parse can produce objects with undefined values at runtime
      if (child !== undefined) {
        const childResult = flattenInto(
          child,
          prefix === "" ? key : `${prefix}.${key}`,
          result,
        );
        emittedNonNull = emittedNonNull || childResult;
      }
    }
    // Emit a presence marker when all children are null or absent.
    // This ensures { attr: null } and {} are both visible at the parent
    // level, so drift comparison naturally treats them as equivalent.
    if (prefix !== "" && !emittedNonNull) {
      result.set(prefix, "{}");
      return true;
    }
    return emittedNonNull;
  }
}
