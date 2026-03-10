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
    for (let i = 0; i < value.length; i++) {
      const child = value[i];
      if (child !== undefined) {
        flattenInto(child, prefix === "" ? `[${String(i)}]` : `${prefix}[${String(i)}]`, result);
      }
    }
  } else {
    // object
    for (const [key, child] of Object.entries(value)) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: JSON.parse can produce objects with undefined values at runtime
      if (child !== undefined) {
        flattenInto(child, prefix === "" ? key : `${prefix}.${key}`, result);
      }
    }
  }
}
