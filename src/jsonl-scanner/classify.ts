/**
 * Shared per-line concern classification for JSON Lines messages.
 *
 * This module owns two pieces of wire-format knowledge used by the
 * causal-relevance visitors: the per-line *concern* facts (resource address,
 * diagnostic severity, errored-hook flag) extracted via {@link lineConcernInfo},
 * and the *message-type vocabulary* the scanner recognizes (via
 * {@link isKnownMessageType}). It operates purely on the already-parsed line
 * object handed to it, so it never re-parses the JSONL.
 *
 * It is not the only place addresses are read: the scanner's record builders
 * (`processDiagnostic`, `processApplyComplete`, …) extract their own richer
 * records separately. This module exists so the relevance visitors and the
 * scanner agree on which types are known and how concern facts are derived.
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
 * Message types the scanner extracts a record from (the `switch` cases in
 * {@link module:jsonl-scanner/scan}). Kept here so the message-type vocabulary
 * has a single owner.
 */
const HANDLED_MESSAGE_TYPES = new Set([
  "version",
  "planned_change",
  "resource_drift",
  "change_summary",
  "apply_complete",
  "apply_errored",
  "diagnostic",
  "outputs",
]);

/**
 * Message types that are valid JSONL but carry no information the report needs.
 * The scanner counts them as parsed but extracts no record. Consumed by
 * `scan.ts`'s dispatch default branch.
 */
export const SKIPPABLE_MESSAGE_TYPES = new Set([
  "log",
  "apply_start",
  "apply_progress",
  "refresh_start",
  "refresh_complete",
  "provision_start",
  "provision_progress",
  "provision_complete",
  "provision_errored",
  "test_abstract",
  "test_file",
  "test_run",
  "test_plan",
  "test_state",
  "test_cleanup",
  "test_summary",
  "test_interrupt",
  "test_status",
  "init_output",
]);

/**
 * Whether `type` is a message type the scanner positively recognizes — either
 * one it builds a record from or one it knowingly skips as noise.
 *
 * The causal-relevance emitter uses this for its fail-safe: a line whose type
 * is *not* known is retained (it may be a new message type carrying failure
 * context), whereas a known type that matches no concern is dropped as noise.
 */
export function isKnownMessageType(type: string): boolean {
  return HANDLED_MESSAGE_TYPES.has(type) || SKIPPABLE_MESSAGE_TYPES.has(type);
}

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
