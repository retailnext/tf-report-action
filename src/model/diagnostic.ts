/**
 * Diagnostic represents an error or warning message emitted during a
 * Terraform/OpenTofu operation. Diagnostics are extracted from the
 * machine-readable UI output and displayed in the apply report.
 *
 * The `summary` and `detail` fields come directly from the tool output;
 * both tools already mask sensitive values in diagnostic messages.
 */
export interface Diagnostic {
  /** "error" or "warning" */
  readonly severity: "error" | "warning";
  /** One-line summary of the diagnostic. */
  readonly summary: string;
  /** Multi-line detailed explanation (may be empty). */
  readonly detail: string;
  /** Resource address this diagnostic pertains to (if applicable). */
  readonly address?: string;
}
