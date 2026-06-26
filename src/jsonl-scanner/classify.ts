/**
 * Shared per-line classification for JSON Lines messages.
 *
 * This is the single owner of wire-format address/severity extraction. Both the
 * scanner's model building and the causal-relevance visitors operate on the
 * already-parsed line object handed to them, so neither re-parses the JSONL.
 *
 * @module jsonl-scanner/classify
 */

/** Hook message types that carry `hook.resource.addr`. */
const ADDRESSED_HOOK_TYPES = new Set([
  "apply_start",
  "apply_progress",
  "apply_complete",
  "apply_errored",
  "refresh_start",
  "refresh_complete",
  "provision_start",
  "provision_progress",
  "provision_complete",
  "provision_errored",
]);

/** Hook message types that signal a failed operation (carry an address). */
const ERRORED_HOOK_TYPES = new Set(["apply_errored", "provision_errored"]);

/**
 * The failure-relevance facts about a single classified line.
 *
 * `address` is the resource address the line is about (hooks, planned_change,
 * resource_drift, and addressed diagnostics). `severity` is set only for
 * `diagnostic` lines. `isErroredHook` is true for `apply_errored` /
 * `provision_errored`.
 */
export interface LineConcernInfo {
  /** Resource address the line is about, if any. */
  readonly address?: string;
  /** Diagnostic severity (`error`, `warning`, `unknown`, …), if a diagnostic. */
  readonly severity?: string;
  /** Whether the line is an errored hook. */
  readonly isErroredHook: boolean;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function hookAddress(obj: Record<string, unknown>): string | undefined {
  const hook = asObject(obj["hook"]);
  const resource = hook && asObject(hook["resource"]);
  const addr = resource?.["addr"];
  return typeof addr === "string" ? addr : undefined;
}

function changeAddress(obj: Record<string, unknown>): string | undefined {
  const change = asObject(obj["change"]);
  const resource = change && asObject(change["resource"]);
  const addr = resource?.["addr"];
  return typeof addr === "string" ? addr : undefined;
}

/**
 * Classify an already-parsed JSONL line object given its `type`.
 *
 * Operates purely on the parsed object — never parses text — so callers reuse
 * the scanner's single `JSON.parse`.
 */
export function lineConcernInfo(
  obj: Record<string, unknown>,
  type: string,
): LineConcernInfo {
  if (type === "diagnostic") {
    const diagnostic = asObject(obj["diagnostic"]);
    const severity = diagnostic?.["severity"];
    const addr = diagnostic?.["address"];
    return {
      isErroredHook: false,
      ...(typeof severity === "string" ? { severity } : {}),
      ...(typeof addr === "string" ? { address: addr } : {}),
    };
  }

  if (type === "planned_change" || type === "resource_drift") {
    const addr = changeAddress(obj);
    return {
      isErroredHook: false,
      ...(addr !== undefined ? { address: addr } : {}),
    };
  }

  if (ADDRESSED_HOOK_TYPES.has(type)) {
    const addr = hookAddress(obj);
    return {
      isErroredHook: ERRORED_HOOK_TYPES.has(type),
      ...(addr !== undefined ? { address: addr } : {}),
    };
  }

  return { isErroredHook: false };
}
