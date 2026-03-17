/**
 * Type definitions for the `terraform validate -json` / `tofu validate -json`
 * output format.
 *
 * Unlike most other `-json` command outputs which produce JSON Lines, the
 * `validate` command emits a single JSON object. The format is documented at:
 *   https://developer.hashicorp.com/terraform/internals/machine-readable-ui
 *
 * Both Terraform and OpenTofu share the same format at version "1.0".
 */

import type { UIDiagnostic } from "./machine-readable-ui.js";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Format version for validate JSON output (currently "1.0" in both tools). */
export const VALIDATE_FORMAT_VERSION = "1.0";

// ─── Validate Output ────────────────────────────────────────────────────────

/**
 * Top-level object returned by `terraform validate -json` or
 * `tofu validate -json`.
 *
 * When `valid` is true, `diagnostics` is empty and counts are zero.
 * When `valid` is false, `diagnostics` contains one or more error or warning
 * entries and the counts reflect the totals.
 */
export interface ValidateOutput {
  /** Schema version for this output format. */
  readonly format_version: string;
  /** Whether the configuration is valid (no errors). */
  readonly valid: boolean;
  /** Total number of error-severity diagnostics. */
  readonly error_count: number;
  /** Total number of warning-severity diagnostics. */
  readonly warning_count: number;
  /** Detailed diagnostics (errors and warnings). */
  readonly diagnostics: readonly UIDiagnostic[];
}
