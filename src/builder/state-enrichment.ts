/**
 * State enrichment — resolves unknown attribute values from post-apply state.
 *
 * After an apply, attributes that were `(known after apply)` at plan time
 * have actual values in the state. This module fills in those placeholders
 * using the state data, turning `(value not in plan)` into real values.
 *
 * Only touches attributes where `isKnownAfterApply === true`. Never modifies
 * attributes that already have real values from the plan. Sensitive values
 * discovered through the state are actively masked as `(sensitive)`.
 *
 * Layer 3 (business logic). May import from tfjson/, flattener/,
 * sensitivity/, model/.
 */

import type { State } from "../tfjson/state.js";
import type { ValueResource, ValuesModule } from "../tfjson/values.js";
import type { JsonValue } from "../tfjson/common.js";
import type { Report } from "../model/report.js";
import { SENSITIVE_MASK } from "../model/sentinels.js";
import { flatten } from "../flattener/index.js";
import { isSensitive } from "../sensitivity/index.js";

/** Threshold for considering a value "large" — mirrors builder/attributes.ts. */
const LARGE_LINE_THRESHOLD = 3;

/**
 * Resolves unknown attribute and output placeholders using post-apply state.
 *
 * Only touches attributes/outputs where `isKnownAfterApply` is `true` — never
 * modifies attributes that already have real values from the plan. Sensitive
 * attributes and outputs discovered through state are actively masked.
 *
 * **Invariant:** After this function returns (with a non-empty state), no
 * resource in the report may have `allUnknownAfterApply === true`.
 *
 * When state is empty (no `values`), this is a no-op — all flags are
 * left untouched.
 */
export function enrichReportFromState(report: Report, state: State): void {
  const stateValues = state.values;
  if (stateValues === undefined) return;

  // Build address → ValueResource lookup from the recursive state tree
  const stateResourceMap = buildResourceMap(stateValues.root_module);

  let enrichedAny = false;

  // ── Enrich resource attributes ────────────────────────────────────────
  for (const resource of report.resources ?? []) {
    if (!resource.hasAttributeDetail) continue;

    const stateResource = stateResourceMap.get(resource.address);

    if (stateResource !== undefined) {
      // Flatten state values and sensitive_values for this resource
      const stateFlat =
        stateResource.values !== undefined
          ? flatten(stateResource.values as JsonValue)
          : new Map<string, string | null>();
      const sensFlat =
        stateResource.sensitive_values !== undefined
          ? flatten(stateResource.sensitive_values as JsonValue)
          : new Map<string, string | null>();

      for (const attr of resource.attributes) {
        if (!attr.isKnownAfterApply) continue;
        if (attr.isSensitive) continue; // already masked from plan

        if (isSensitive(attr.name, sensFlat, sensFlat)) {
          // Discovered to be sensitive through state — actively mask
          attr.isSensitive = true;
          attr.after = SENSITIVE_MASK;
          attr.isKnownAfterApply = false;
          enrichedAny = true;
        } else if (stateFlat.has(attr.name)) {
          // Resolve to actual value from state
          const resolved = stateFlat.get(attr.name) ?? null;
          attr.after = resolved;
          attr.isKnownAfterApply = false;
          attr.isLarge = isLargeValue(resolved);
          enrichedAny = true;
        }
      }
    }

    // Invariant: clear allUnknownAfterApply for all resources when state
    // is available. Resources found in state have values resolved or masked.
    // Resources NOT in state were destroyed/moved — no pending computed values.
    resource.allUnknownAfterApply = false;
  }

  // ── Enrich outputs ────────────────────────────────────────────────────
  const stateOutputs = stateValues.outputs;
  if (stateOutputs !== undefined) {
    for (const output of report.outputs ?? []) {
      if (!output.isKnownAfterApply) continue;
      if (output.isSensitive) continue; // already masked from plan

      const stateOutput = stateOutputs[output.name];
      if (stateOutput === undefined) continue;

      if (stateOutput.sensitive) {
        // Discovered to be sensitive through state — actively mask
        output.isSensitive = true;
        output.after = SENSITIVE_MASK;
        output.isKnownAfterApply = false;
        enrichedAny = true;
      } else if (stateOutput.value !== undefined) {
        output.after = stringifyValue(stateOutput.value);
        output.isKnownAfterApply = false;
        enrichedAny = true;
      }
    }
  }

  if (enrichedAny) {
    report.stateEnriched = true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Build a map from resource address to ValueResource by walking the
 * recursive ValuesModule tree.
 */
function buildResourceMap(
  rootModule: ValuesModule | undefined,
): Map<string, ValueResource> {
  const map = new Map<string, ValueResource>();
  if (rootModule === undefined) return map;

  function walk(mod: ValuesModule): void {
    for (const resource of mod.resources ?? []) {
      if (resource.address !== undefined) {
        map.set(resource.address, resource);
      }
    }
    for (const child of mod.child_modules ?? []) {
      walk(child);
    }
  }

  walk(rootModule);
  return map;
}

/**
 * Stringify a JSON value for display. Primitives become their string
 * representation; objects and arrays become compact JSON.
 */
function stringifyValue(value: JsonValue | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Returns true if the value looks large: more than LARGE_LINE_THRESHOLD
 * newlines, or looks like JSON (starts with `{` or `[`) or XML (starts
 * with `<`). Mirrors the logic in `src/builder/attributes.ts`.
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
