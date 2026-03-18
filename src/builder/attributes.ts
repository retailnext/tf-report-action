/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

import type { Change } from "../tfjson/plan.js";
import type { AttributeShadow } from "../tfjson/common.js";
import type { JsonValue } from "../tfjson/common.js";
import type { AttributeChange } from "../model/attribute.js";
import type { BuildOptions } from "./options.js";
import { flatten } from "../flattener/index.js";
import { isSensitive } from "../sensitivity/index.js";
import { SENSITIVE_MASK, KNOWN_AFTER_APPLY } from "../model/sentinels.js";

const LARGE_LINE_THRESHOLD = 3;

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
  return flatten(shadow as unknown as JsonValue);
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
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith("<")
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
 * Builds the attribute change list for a single resource change.
 */
export function buildAttributeChanges(
  change: Change,
  options: BuildOptions,
): AttributeChange[] {
  const before = change.before ?? null;
  const after = change.after ?? null;

  const beforeSensitiveMap = shadowToMap(change.before_sensitive);
  const afterSensitiveMap = shadowToMap(change.after_sensitive);
  const unknownMap = shadowToMap(change.after_unknown);

  // Check if entire resource is unknown after apply
  const allUnknown = unknownMap.get("") === "true";

  // Flatten the before/after objects to get nested keys
  const beforeFlat = before
    ? flatten(before as unknown as JsonValue)
    : new Map<string, string | null>();
  const afterFlat = after
    ? flatten(after as unknown as JsonValue)
    : new Map<string, string | null>();

  // Collect all flattened keys
  const flatKeys = new Set<string>();
  for (const [k] of beforeFlat) flatKeys.add(k);
  for (const [k] of afterFlat) flatKeys.add(k);
  // Also add keys that are unknown after apply
  for (const [k, v] of unknownMap) {
    if (k !== "" && v === "true") flatKeys.add(k);
  }

  const result: AttributeChange[] = [];

  for (const key of flatKeys) {
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
