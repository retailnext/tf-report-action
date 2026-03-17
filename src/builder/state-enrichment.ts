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
 * Layer 3 (business logic). May import from parser/, flattener/, model/.
 */

import type {
  RawState,
  RawStateResource,
  RawStateInstance,
} from "../parser/state.js";
import type { JsonValue } from "../tfjson/common.js";
import type { Report } from "../model/report.js";
import { SENSITIVE_MASK } from "../model/sentinels.js";
import { flatten } from "../flattener/index.js";

/** Threshold for considering a value "large" — mirrors builder/attributes.ts. */
const LARGE_LINE_THRESHOLD = 3;

/** View of a single resource instance from state. */
interface StateInstance {
  /** Raw attribute values, for direct top-level lookup. */
  rawValues: Record<string, JsonValue> | undefined;
  /** Flattened attribute values, for dotted-path lookup. */
  flatValues: Map<string, string | null>;
  sensitiveNames: ReadonlySet<string>;
}

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
 * When state has no resources, this is a no-op — all flags are left untouched.
 */
export function enrichReportFromState(report: Report, state: RawState): void {
  const stateResources = state.resources;
  const hasResources =
    stateResources !== undefined && stateResources.length > 0;
  const hasOutputs =
    state.outputs !== undefined && Object.keys(state.outputs).length > 0;
  if (!hasResources && !hasOutputs) return;

  // Build address → StateInstance lookup from flat resource list
  const instanceMap = hasResources
    ? buildInstanceMap(stateResources)
    : new Map<string, StateInstance>();

  let enrichedAny = false;

  // ── Enrich resource attributes ────────────────────────────────────────
  for (const resource of report.resources ?? []) {
    if (!resource.hasAttributeDetail) continue;

    const flat = instanceMap.get(resource.address);

    if (flat !== undefined) {
      for (const attr of resource.attributes) {
        if (!attr.isKnownAfterApply) continue;
        if (attr.isSensitive) continue; // already masked from plan

        if (flat.sensitiveNames.has(attr.name)) {
          // Discovered to be sensitive through state — actively mask
          attr.isSensitive = true;
          attr.after = SENSITIVE_MASK;
          attr.isKnownAfterApply = false;
          enrichedAny = true;
        } else {
          // Try raw lookup first (handles complex types like objects/arrays
          // whose top-level key doesn't appear in the flattened map), then
          // fall back to the flattened map for dotted-path attributes.
          const resolved = resolveFromInstance(flat, attr.name);
          if (resolved !== undefined) {
            attr.after = resolved;
            attr.isKnownAfterApply = false;
            attr.isLarge = isLargeValue(resolved);
            enrichedAny = true;
          }
        }
      }
    }

    // Invariant: clear allUnknownAfterApply for all resources when state
    // is available. Resources found in state have values resolved or masked.
    // Resources NOT in state were destroyed/moved — no pending computed values.
    resource.allUnknownAfterApply = false;
  }

  // ── Enrich outputs ────────────────────────────────────────────────────
  const stateOutputs = state.outputs;
  if (stateOutputs !== undefined) {
    for (const output of report.outputs ?? []) {
      if (!output.isKnownAfterApply) continue;
      if (output.isSensitive) continue; // already masked from plan

      const stateOutput = stateOutputs[output.name];
      if (stateOutput === undefined) continue;

      if (stateOutput.sensitive === true) {
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
 * Build a map from resource address to state instance values.
 *
 * Raw tfstate resources have a flat list with `module`, `type`, `name`,
 * and `instances[]`. Each instance has an optional `index_key` for
 * count/for_each. The address is constructed to match the plan's
 * fully-qualified resource address format.
 */
function buildInstanceMap(
  resources: readonly RawStateResource[],
): Map<string, StateInstance> {
  const map = new Map<string, StateInstance>();

  for (const res of resources) {
    for (const inst of res.instances ?? []) {
      const address = buildAddress(res, inst);
      const rawValues = inst.attributes;
      const flatValues =
        rawValues !== undefined
          ? flatten(rawValues as JsonValue)
          : new Map<string, string | null>();
      const sensitiveNames = extractSensitiveNames(inst);
      map.set(address, { rawValues, flatValues, sensitiveNames });
    }
  }

  return map;
}

/**
 * Construct a fully-qualified resource address from raw state fields.
 *
 * Format: `[module.]type.name[index]`
 * - `module` is optional, already in `module.xxx` format
 * - `index_key` is a number for count, string for for_each, absent for single
 */
function buildAddress(res: RawStateResource, inst: RawStateInstance): string {
  let address = "";
  if (res.module !== undefined && res.module !== "") {
    address = `${res.module}.`;
  }
  address += `${res.type}.${res.name}`;
  if (inst.index_key !== undefined) {
    if (typeof inst.index_key === "number") {
      address += `[${String(inst.index_key)}]`;
    } else {
      address += `["${inst.index_key}"]`;
    }
  }
  return address;
}

/**
 * Extract top-level sensitive attribute names from the raw state's
 * `sensitive_attributes` path descriptors.
 *
 * Each entry is an array of path segments. We only match single-segment
 * `get_attr` paths (top-level attributes), which matches the granularity
 * of the flattened attribute names in the report.
 */
function extractSensitiveNames(inst: RawStateInstance): ReadonlySet<string> {
  const names = new Set<string>();
  for (const path of inst.sensitive_attributes ?? []) {
    const first = path[0];
    if (first?.type === "get_attr") {
      names.add(first.value);
    }
  }
  return names;
}

/**
 * Resolve an attribute value from a state instance.
 *
 * Tries a direct lookup in the raw attributes first (handles complex types
 * like objects whose top-level key doesn't appear in the flattened map),
 * then falls back to the flattened map for dotted-path attribute names.
 * Returns `undefined` when the attribute is not found in state.
 */
function resolveFromInstance(
  inst: StateInstance,
  attrName: string,
): string | null | undefined {
  // Direct lookup in raw attributes (handles top-level complex types)
  if (inst.rawValues !== undefined && attrName in inst.rawValues) {
    return stringifyValue(inst.rawValues[attrName] as JsonValue);
  }
  // Flattened lookup (handles dotted-path attribute names)
  if (inst.flatValues.has(attrName)) {
    return inst.flatValues.get(attrName) ?? null;
  }
  return undefined;
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
