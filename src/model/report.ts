import type { ModuleGroup } from "./module-group.js";
import type { Summary } from "./summary.js";
import type { OutputChange } from "./output.js";
import type { Diagnostic } from "./diagnostic.js";
import type { ApplyStatus } from "./apply-status.js";
import type { StepIssue } from "./step-issue.js";
import type { StepOutcome } from "./step-outcome.js";

/**
 * A structured report built from plan JSON (Tier 1).
 *
 * This is the richest report variant — it has full resource detail,
 * attribute diffs, module grouping, etc. Produced by `buildReport()`
 * and `buildApplyReport()`.
 */
export interface StructuredReport {
  readonly kind: "structured";

  /** Report title (rendered as the top-level heading). */
  title: string;

  /** Step-level issues (failed init/validate, parse errors). */
  issues: StepIssue[];

  /** Whether this is an apply report (vs plan-only). */
  isApply: boolean;

  /** terraform_version field from the plan (may be a Terraform or OpenTofu version string). */
  toolVersion: string | null;
  formatVersion: string;
  /** timestamp field from the plan, if present (OpenTofu plans include this). */
  timestamp: string | null;
  summary: Summary;
  /** Resources grouped by module. Root module resources have moduleAddress === "". */
  modules: ModuleGroup[];
  /** Top-level output changes (not inside any module). */
  outputs: OutputChange[];
  /**
   * Resources whose real-world state has drifted from the prior state,
   * grouped by module. Populated from plan.resource_drift.
   * Empty array when no drift is detected.
   */
  driftModules: ModuleGroup[];
  /**
   * Diagnostics (errors and warnings) from the apply run.
   * Only present in apply reports; undefined for plan-only reports.
   */
  diagnostics?: Diagnostic[];
  /**
   * Per-resource apply outcomes (success/failure, elapsed time).
   * Only present in apply reports; undefined for plan-only reports.
   */
  applyStatuses?: ApplyStatus[];

  /** Workspace name for dedup marker and title prefix. */
  workspace?: string;
  /** GitHub Actions logs URL. */
  logsUrl?: string;
}

/**
 * A text-fallback report built from raw command output (Tier 3).
 *
 * Produced when structured plan JSON is unavailable but raw stdout
 * from plan/apply commands was captured.
 */
export interface TextFallbackReport {
  readonly kind: "text-fallback";
  readonly title: string;
  readonly issues: readonly StepIssue[];
  readonly readErrors: readonly string[];
  readonly planContent?: string;
  readonly planTruncated?: boolean;
  readonly applyContent?: string;
  readonly applyTruncated?: boolean;
  readonly steps: readonly StepOutcome[];
  /** Whether any readable output was found. */
  readonly hasOutput: boolean;
  readonly workspace?: string;
  readonly logsUrl?: string;
}

/**
 * A workflow-only report with just step statuses (Tier 4).
 *
 * Produced when no plan/apply output is available at all — the report
 * shows the overall step outcomes and a link to the full logs.
 */
export interface WorkflowReport {
  readonly kind: "workflow";
  readonly title: string;
  readonly steps: readonly StepOutcome[];
  readonly logsUrl?: string;
  readonly workspace?: string;
}

/**
 * An error report produced when the pipeline itself fails.
 *
 * Shown when steps context is invalid, plan parsing fails with no
 * fallback, or other unrecoverable errors occur.
 */
export interface ErrorReport {
  readonly kind: "error";
  readonly title: string;
  readonly message: string;
  readonly steps?: readonly StepOutcome[];
  readonly workspace?: string;
}

/**
 * Discriminated union of all report variants.
 *
 * The builder produces a Report; the renderer switches on `kind` to
 * determine how to render it. This ensures the same parse → build →
 * render pipeline works for all tiers.
 */
export type Report = StructuredReport | TextFallbackReport | WorkflowReport | ErrorReport;
