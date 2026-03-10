import type { Plan } from "../tfjson/plan.js";
import type { OutputChange } from "../model/output.js";
import { determineAction } from "./action.js";

/**
 * Maps plan.output_changes to OutputChange[]. Masks sensitive outputs.
 */
export function buildOutputChanges(plan: Plan): OutputChange[] {
  const outputChanges = plan.output_changes;
  if (!outputChanges) return [];

  const result: OutputChange[] = [];

  for (const [name, change] of Object.entries(outputChanges)) {
    const action = determineAction(change.actions);

    // Determine if sensitive: before_sensitive or after_sensitive being `true` at root
    const isSensitive =
      change.before_sensitive === true ||
      change.after_sensitive === true;

    const before = isSensitive
      ? null
      : valueToString(change.before ?? null);

    const after = isSensitive
      ? null
      : valueToString(change.after ?? null);

    result.push({
      name,
      action,
      before,
      after,
      isSensitive,
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
