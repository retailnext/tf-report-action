import type { Plan } from "../tfjson/plan.js";
import type { OutputChange } from "../model/output.js";
import { determineAction } from "./action.js";
import { KNOWN_AFTER_APPLY } from "../model/sentinels.js";

const LARGE_LINE_THRESHOLD = 3;

/**
 * Maps plan.output_changes to OutputChange[]. Filters unchanged (no-op) outputs
 * and masks sensitive outputs. Outputs whose value is not yet known
 * (after_unknown === true) use the KNOWN_AFTER_APPLY sentinel so the renderer
 * can display it appropriately rather than leaving the After cell blank.
 */
export function buildOutputChanges(plan: Plan): OutputChange[] {
  const outputChanges = plan.output_changes;
  if (!outputChanges) return [];

  const result: OutputChange[] = [];

  for (const [name, change] of Object.entries(outputChanges)) {
    const action = determineAction(change.actions);

    // Skip unchanged outputs — same pattern as resource no-op filtering
    if (action === "no-op") continue;

    // Determine if sensitive: before_sensitive or after_sensitive being `true` at root
    const isSensitive =
      change.before_sensitive === true || change.after_sensitive === true;

    const before = isSensitive ? null : valueToString(change.before ?? null);

    let after: string | null;
    let isKnownAfterApply = false;
    if (isSensitive) {
      after = null;
    } else if (change.after_unknown === true) {
      // The output value will only be known after apply — show the sentinel
      // rather than leaving the cell blank.
      after = KNOWN_AFTER_APPLY;
      isKnownAfterApply = true;
    } else {
      after = valueToString(change.after ?? null);
    }

    const isLarge =
      isLargeValue(isSensitive ? null : before) ||
      isLargeValue(isSensitive || isKnownAfterApply ? null : after);

    result.push({
      name,
      action,
      before,
      after,
      isSensitive,
      isLarge,
      isKnownAfterApply,
    });
  }

  return result;
}

function valueToString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return JSON.stringify(val, null, 2);
}

/**
 * Returns true if the value looks large: more than LARGE_LINE_THRESHOLD newlines,
 * or looks like JSON (starts with { or [) or XML (starts with <).
 * Same heuristic as isLargeValue in attributes.ts.
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
