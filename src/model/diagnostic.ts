import type { UIDiagnosticRange, UIDiagnosticSnippet } from "../tfjson/machine-readable-ui.js";

/**
 * Diagnostic represents an error or warning message emitted during an
 * OpenTofu/Terraform operation. Diagnostics are extracted from validate
 * JSON, plan JSONL, and apply JSONL, then displayed in the report.
 *
 * The `summary` and `detail` fields come directly from the tool output;
 * both tools already mask sensitive values in diagnostic messages.
 *
 * When sourced from JSONL or validate JSON, `range` and `snippet`
 * provide source code context. These are richer than what plan JSON
 * provides and should be rendered when present.
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
  /** Which phase produced this diagnostic. Set by the builder, not the scanner. */
  readonly source?: "validate" | "plan" | "apply";
  /** Source code location range (from JSONL or validate JSON). */
  readonly range?: UIDiagnosticRange;
  /** Source code snippet for display context (from JSONL or validate JSON). */
  readonly snippet?: UIDiagnosticSnippet;
}
