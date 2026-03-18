import type { ResourceChange } from "./resource.js";
import type { Summary } from "./summary.js";
import type { OutputChange } from "./output.js";
import type { Diagnostic } from "./diagnostic.js";
import type { ApplyStatus } from "./apply-status.js";
import type { StepIssue } from "./step-issue.js";
import type { StepOutcome } from "./step-outcome.js";

// ---------------------------------------------------------------------------
// Tool identification
// ---------------------------------------------------------------------------

/**
 * The IaC tool CLI command name.
 *
 * Used in warning messages and command hints to tell the user which binary
 * was (or should be) invoked. Auto-detected from available step outputs
 * when not explicitly provided.
 */
export type Tool = "terraform" | "tofu";

// ---------------------------------------------------------------------------
// Raw step stdout
// ---------------------------------------------------------------------------

/**
 * Raw stdout content from a step whose output could not be parsed into
 * structured report fields. This is specifically the step's **stdout** —
 * stderr is handled separately via StepIssue.
 *
 * Use case: `tofu plan` (without `-json`) produces human-readable text to
 * stdout. That text can't be parsed structurally, so it's displayed as-is
 * in a collapsible code block. The same step's stderr (warnings,
 * deprecations) is still surfaced independently as a StepIssue.
 */
export interface RawStepStdout {
  /** Step identifier (e.g. "plan", "apply", "show-plan"). */
  readonly stepId: string;
  /** Human-readable label (e.g. "Plan Output", "Apply Output"). */
  readonly label: string;
  /** The raw stdout content. */
  readonly content: string;
  /** Whether the content was truncated due to size limits. */
  readonly truncated: boolean;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/**
 * A single progressively-enriched report. There is no discriminated union —
 * each step independently contributes structured data or raw content based
 * on what's parseable. The renderer checks what fields are present.
 *
 * ## Construction patterns (not separate types)
 *
 * - **Full structured report** = Report with `summary`, `modules`,
 *   `formatVersion` populated (from show-plan JSON)
 * - **JSONL-enriched report** = Report with `summary`, `modules` (no
 *   attributes) populated (from plan/apply JSONL)
 * - **Raw text report** = Report with `rawStdout` populated
 * - **Workflow-only report** = Report with only `steps` populated
 * - **Error report** = Report with `error` populated
 */
export interface Report {
  // ── Always present ──────────────────────────────────────────────────────

  /** Report title (rendered as the top-level heading). */
  title: string;

  /** Step-level issues (failed steps, parse errors, stderr warnings). */
  issues: StepIssue[];

  /** Step outcomes for all steps. */
  steps: StepOutcome[];

  /** Warnings about missing data, scanner quality, parse failures. */
  warnings: string[];

  /**
   * Raw stdout from steps whose output could not be parsed structurally.
   * Each entry is a collapsible code block in the rendered output.
   */
  rawStdout: RawStepStdout[];

  // ── Present when environment allows ─────────────────────────────────────

  /** Workspace name for dedup marker and title prefix. */
  workspace?: string;

  /** GitHub Actions logs URL. */
  logsUrl?: string;

  /** Auto-detected IaC tool, or undefined when detection was inconclusive. */
  tool?: Tool;

  // ── Operation metadata ──────────────────────────────────────────────────

  /**
   * The operation type. Replaces the former `isApply` boolean.
   * Comes from `change_summary.operation` in JSONL. When only plan JSON
   * is available, inferred from step presence.
   */
  operation?: "plan" | "apply" | "destroy";

  /** Tool version string from plan JSON (`terraform_version` field). */
  toolVersion?: string;

  /** Plan JSON format version. */
  formatVersion?: string;

  /** Timestamp from the plan, if present (OpenTofu plans include this). */
  timestamp?: string;

  // ── Progressive enrichment from JSONL or plan JSON ──────────────────────

  /** Plan/apply summary with per-action-type resource counts. */
  summary?: Summary;

  /**
   * Flat list of resource changes. Resources from show-plan JSON have full
   * attribute detail (`hasAttributeDetail: true`); resources from JSONL
   * scanning have action and address only (`hasAttributeDetail: false`).
   * The renderer groups by module address (derived from address + type)
   * for display.
   */
  resources?: ResourceChange[];

  /**
   * Resources whose real-world state has drifted from the prior state.
   * Populated from plan JSON `resource_drift` or JSONL `resource_drift`
   * messages. The renderer groups by module for display.
   */
  driftResources?: ResourceChange[];

  /** Top-level output changes (not inside any module). */
  outputs?: OutputChange[];

  /**
   * Diagnostics (errors and warnings) from validate, plan, and/or apply.
   * Each diagnostic carries a `source` field identifying its origin.
   */
  diagnostics?: Diagnostic[];

  /**
   * Per-resource apply outcomes (success/failure, elapsed time).
   * Present only in apply reports.
   */
  applyStatuses?: ApplyStatus[];

  /**
   * Whether state enrichment was applied to resolve unknown attribute values.
   * Set to true when `enrichReportFromState()` successfully resolved at least
   * one `isKnownAfterApply` attribute or output from post-apply state.
   */
  stateEnriched?: boolean;

  // ── Error state ─────────────────────────────────────────────────────────

  /** Pipeline error message. When set, the report is an error report. */
  error?: string;
}
