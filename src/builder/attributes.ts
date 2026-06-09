/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

import type { Change } from "../tfjson/plan.js";
import type { AttributeShadow, JsonValue } from "../tfjson/common.js";
import type { AttributeChange } from "../model/attribute.js";
import type { BuildOptions } from "./options.js";
import { flatten } from "../flattener/index.js";
import { isSensitive } from "../sensitivity/index.js";
import { SENSITIVE_MASK, KNOWN_AFTER_APPLY } from "../model/sentinels.js";

const LARGE_LINE_THRESHOLD = 3;

/**
 * Minimum number of elements for an array to be rendered as a collection
 * (single large-value context diff) rather than positional element-by-element rows.
 */
const COLLECTION_MIN_ELEMENTS = 4;

/**
 * Converts an AttributeShadow value to a flat map suitable for sensitivity/unknown checks.
 * If the shadow is a boolean `true`, stores empty-string key with "true" to signal root-level.
 */
function shadowToMap(
  shadow: AttributeShadow | undefined,
): Map<string, string | null> {
  if (shadow === undefined) return new Map();
  if (typeof shadow === "boolean") {
    const m = new Map<string, string | null>();
    m.set("", shadow ? "true" : "false");
    return m;
  }
  // AttributeShadow is structurally compatible with JsonValue — cast via unknown.
  return flatten(shadow);
}

/**
 * Returns true if the flattened unknown map indicates the value at key is unknown after apply.
 */
function isUnknownAfterApply(
  key: string,
  unknownMap: Map<string, string | null>,
): boolean {
  // Root boolean true means whole resource is unknown
  if (unknownMap.get("") === "true") return true;
  return unknownMap.get(key) === "true";
}

/**
 * Returns true if the value looks large: more than LARGE_LINE_THRESHOLD newlines,
 * or looks like JSON (starts with { or [) or XML (starts with <).
 */
function isLargeValue(value: string | null): boolean {
  if (value === null) return false;
  const trimmed = value.trim();
  if (
    trimmed.length > 2 &&
    (trimmed.startsWith("{") ||
      trimmed.startsWith("[") ||
      trimmed.startsWith("<"))
  ) {
    return true;
  }
  let count = 0;
  for (const ch of value) {
    if (ch === "\n") {
      count++;
      if (count > LARGE_LINE_THRESHOLD) return true;
    }
  }
  return false;
}

/**
 * Returns true if the value is a JSON array of simple scalars (string, number,
 * boolean) with at least COLLECTION_MIN_ELEMENTS elements. Null elements and
 * nested arrays/objects disqualify the array.
 */
export function isFlatScalarArray(value: JsonValue): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length < COLLECTION_MIN_ELEMENTS) return false;
  for (const elem of value) {
    if (elem === null || typeof elem === "object") return false;
  }
  return true;
}

/**
 * Looks up the shadow value for a specific top-level attribute key.
 * Returns undefined if the shadow doesn't cover this key, boolean true if the
 * whole attribute is marked, or the sub-shadow if it's per-element.
 */
function getAttributeShadow(
  shadow: AttributeShadow | undefined,
  key: string,
): AttributeShadow | undefined {
  if (shadow === undefined) return undefined;
  // Boolean true at root means the entire resource is sensitive/unknown
  if (shadow === true) return true;
  if (shadow === false) return undefined;
  // Array shadow at root level doesn't apply to named keys
  if (Array.isArray(shadow)) return undefined;
  // Object shadow — look up the key
  const val = shadow[key];
  return val;
}

/**
 * Checks if a collection attribute should fall back to flattened rendering
 * due to per-element sensitivity or unknown markers.
 * Returns true when collection-aware rendering is safe (whole-attribute or absent).
 */
function isCollectionShadowSimple(
  shadow: AttributeShadow | undefined,
): boolean {
  // undefined or false → not marked → safe
  if (shadow === undefined || shadow === false) return true;
  // boolean true → whole attribute marked → safe (we handle at attribute level)
  if (shadow === true) return true;
  // Array of all false → no elements marked → safe
  if (Array.isArray(shadow)) {
    return shadow.every((el) => el === false);
  }
  // Object or array with true elements → per-element markers → fall back
  return false;
}

/**
 * Builds a single AttributeChange for a flat scalar collection, joining
 * elements with newlines in their original order.
 */
function buildCollectionAttributeChange(
  key: string,
  beforeArr: JsonValue | undefined | null,
  afterArr: JsonValue | undefined | null,
  beforeSensitiveShadow: AttributeShadow | undefined,
  afterSensitiveShadow: AttributeShadow | undefined,
  afterUnknownShadow: AttributeShadow | undefined,
): AttributeChange {
  const sensitive =
    beforeSensitiveShadow === true || afterSensitiveShadow === true;
  const knownAfterApply = afterUnknownShadow === true;

  let beforeVal: string | null;
  let afterVal: string | null;

  if (sensitive) {
    beforeVal = beforeArr != null ? SENSITIVE_MASK : null;
    afterVal = afterArr != null || knownAfterApply ? SENSITIVE_MASK : null;
  } else if (knownAfterApply) {
    beforeVal = Array.isArray(beforeArr) ? joinElements(beforeArr) : null;
    afterVal = KNOWN_AFTER_APPLY;
  } else {
    beforeVal = Array.isArray(beforeArr) ? joinElements(beforeArr) : null;
    afterVal = Array.isArray(afterArr) ? joinElements(afterArr) : null;
  }

  return {
    name: key,
    before: beforeVal,
    after: afterVal,
    isSensitive: sensitive,
    isLarge: true,
    isKnownAfterApply: knownAfterApply,
  };
}

/** Joins array elements as newline-separated strings in original order. */
function joinElements(arr: readonly JsonValue[]): string {
  return arr.map((el) => String(el as string | number | boolean)).join("\n");
}

/**
 * Builds the attribute change list for a single resource change.
 */
export function buildAttributeChanges(
  change: Change,
  options: BuildOptions,
): AttributeChange[] {
  const before = change.before ?? null;
  const after = change.after ?? null;

  // --- Collection-aware detection (before flattening) ---
  // Identify top-level attributes that are flat scalar arrays and handle them
  // as single large-value entries rather than positional element-by-element rows.
  const collectionKeys = new Set<string>();
  const result: AttributeChange[] = [];

  if (before !== null || after !== null) {
    const beforeObj =
      before !== null && typeof before === "object" && !Array.isArray(before)
        ? (before as Record<string, JsonValue>)
        : null;
    const afterObj =
      after !== null && typeof after === "object" && !Array.isArray(after)
        ? (after as Record<string, JsonValue>)
        : null;

    // Collect candidate keys where at least one side is a flat scalar array
    const candidateKeys = new Set<string>();
    if (beforeObj) {
      for (const k of Object.keys(beforeObj)) {
        if (isFlatScalarArray(beforeObj[k] as JsonValue)) candidateKeys.add(k);
      }
    }
    if (afterObj) {
      for (const k of Object.keys(afterObj)) {
        if (isFlatScalarArray(afterObj[k] as JsonValue)) candidateKeys.add(k);
      }
    }

    for (const key of candidateKeys) {
      const bVal = beforeObj?.[key] ?? null;
      const aVal = afterObj?.[key] ?? null;

      // The non-qualifying side must be null or also a flat scalar array
      // (or a small array that we'll render as multiline anyway)
      if (bVal !== null && !Array.isArray(bVal)) continue;
      if (aVal !== null && !Array.isArray(aVal)) continue;
      // If it's an array, all elements must be scalars (no nulls/objects)
      if (Array.isArray(bVal) && !isAllScalars(bVal)) continue;
      if (Array.isArray(aVal) && !isAllScalars(aVal)) continue;

      // Check that sensitivity/unknown shadows are simple (not per-element)
      const bSensitive = getAttributeShadow(change.before_sensitive, key);
      const aSensitive = getAttributeShadow(change.after_sensitive, key);
      const aUnknown = getAttributeShadow(change.after_unknown, key);
      if (!isCollectionShadowSimple(bSensitive)) continue;
      if (!isCollectionShadowSimple(aSensitive)) continue;
      if (!isCollectionShadowSimple(aUnknown)) continue;

      const attrChange = buildCollectionAttributeChange(
        key,
        bVal,
        aVal,
        bSensitive,
        aSensitive,
        aUnknown,
      );

      // Skip unchanged collections unless showUnchangedAttributes is set
      if (
        !options.showUnchangedAttributes &&
        attrChange.before === attrChange.after &&
        !attrChange.isKnownAfterApply &&
        !attrChange.isSensitive
      ) {
        // Still mark as collection key to exclude from flatten loop
        collectionKeys.add(key);
        continue;
      }

      collectionKeys.add(key);
      result.push(attrChange);
    }
  }

  // --- Standard flattened attribute processing ---
  const beforeSensitiveMap = shadowToMap(change.before_sensitive);
  const afterSensitiveMap = shadowToMap(change.after_sensitive);
  const unknownMap = shadowToMap(change.after_unknown);

  // Check if entire resource is unknown after apply
  const allUnknown = unknownMap.get("") === "true";

  // Flatten the before/after objects to get nested keys
  const beforeFlat = before
    ? flatten(before)
    : new Map<string, string | null>();
  const afterFlat = after ? flatten(after) : new Map<string, string | null>();

  // Collect all flattened keys
  const flatKeys = new Set<string>();
  for (const [k] of beforeFlat) flatKeys.add(k);
  for (const [k] of afterFlat) flatKeys.add(k);
  // Also add keys that are unknown after apply
  for (const [k, v] of unknownMap) {
    if (k !== "" && v === "true") flatKeys.add(k);
  }

  for (const key of flatKeys) {
    // Skip keys that belong to a collection-handled attribute
    if (belongsToCollection(key, collectionKeys)) continue;

    const sensitive = isSensitive(key, beforeSensitiveMap, afterSensitiveMap);

    let beforeVal: string | null;
    let afterVal: string | null;

    if (sensitive) {
      beforeVal = beforeFlat.has(key) ? SENSITIVE_MASK : null;
      afterVal =
        afterFlat.has(key) || isUnknownAfterApply(key, unknownMap)
          ? SENSITIVE_MASK
          : null;
    } else {
      beforeVal = beforeFlat.has(key) ? (beforeFlat.get(key) ?? null) : null;

      if (allUnknown || isUnknownAfterApply(key, unknownMap)) {
        afterVal = KNOWN_AFTER_APPLY;
      } else {
        afterVal = afterFlat.has(key) ? (afterFlat.get(key) ?? null) : null;
      }
    }

    const isKnownAfterApply =
      !sensitive && (allUnknown || isUnknownAfterApply(key, unknownMap));

    // Skip unchanged unless option set.
    // Sensitive attributes with an actual value on either side are always included —
    // masking collapses both before and after to "(sensitive)", so we cannot use the
    // masked values to detect whether the underlying value actually changed.
    const hasSensitiveValue =
      sensitive && (beforeFlat.has(key) || afterFlat.has(key));
    if (
      !options.showUnchangedAttributes &&
      beforeVal === afterVal &&
      !isKnownAfterApply &&
      !hasSensitiveValue
    ) {
      continue;
    }

    const large =
      isLargeValue(sensitive ? null : beforeVal) ||
      isLargeValue(sensitive || isKnownAfterApply ? null : afterVal);

    result.push({
      name: key,
      before: beforeVal,
      after: afterVal,
      isSensitive: sensitive,
      isLarge: large,
      isKnownAfterApply,
    });
  }

  // Sort by key name for stable output
  result.sort((a, b) => a.name.localeCompare(b.name));

  return result;
}

/**
 * Returns true if all elements in the array are simple scalars (no nulls, no
 * objects, no nested arrays). Unlike isFlatScalarArray, does not check length.
 */
function isAllScalars(arr: JsonValue[]): boolean {
  for (const elem of arr) {
    if (elem === null || typeof elem === "object") return false;
  }
  return true;
}

/**
 * Returns true if a flattened key belongs to an attribute that was handled
 * as a collection. Matches the key itself or any key starting with "attr[".
 */
function belongsToCollection(
  flatKey: string,
  collectionKeys: Set<string>,
): boolean {
  for (const ck of collectionKeys) {
    if (flatKey === ck) return true;
    if (flatKey.startsWith(`${ck}[`)) return true;
  }
  return false;
}
