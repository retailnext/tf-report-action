/**
 * Types for the JSONL scanner — the single JSON Lines processing path.
 *
 * The scanner extracts typed records from OpenTofu/Terraform `-json` output.
 * Both `scanString` (in-memory) and `scanFile` (chunked streaming) return
 * a `ScanResult`.
 *
 * @module jsonl-scanner/types
 */

import type { Diagnostic } from "../model/diagnostic.js";
import type { ApplyStatus } from "../model/apply-status.js";
import type { Tool } from "../model/report.js";
import type { PlanAction } from "../model/plan-action.js";
import type {
  UIChangeSummary,
  UIOutputsMessage,
} from "../tfjson/machine-readable-ui.js";

/**
 * A planned resource change extracted from a `planned_change` or
 * `resource_drift` JSONL message. Contains the subset of fields
 * needed for report building without attribute detail.
 *
 * Unlike the full resource model from show-plan JSON, this does NOT include
 * attribute-level before/after values — JSONL messages only carry the
 * resource address, type, action, and optional reason.
 */
export interface PlannedChange {
  /** Full resource address (e.g. "module.child.aws_instance.web[0]"). */
  readonly address: string;
  /** Resource type (e.g. "aws_instance"). */
  readonly resourceType: string;
  /** Module address ("" for root module). */
  readonly module: string;
  /** The planned action. */
  readonly action: PlanAction;
  /** Optional reason for the action (e.g. "tainted", "cannot_update"). */
  readonly reason?: string;
}

/**
 * Result of scanning a JSONL stream. Contains all extracted records
 * and quality tracking counters.
 *
 * The scanner is step-unaware — it does not know whether it is scanning
 * plan or apply output. The builder sets `Diagnostic.source` after scanning.
 *
 * Quality counters (`totalLines`, `parsedLines`, `unknownTypeLines`,
 * `unparseableLines`) are used by the builder to generate Report warnings
 * when scanning quality is low (e.g. "47 lines could not be parsed").
 */
export interface ScanResult {
  /** Resources from `planned_change` messages. */
  readonly plannedChanges: PlannedChange[];
  /** Apply outcomes from `apply_complete` / `apply_errored` messages. */
  readonly applyStatuses: ApplyStatus[];
  /** Diagnostics from `diagnostic` messages (without `source` field set). */
  readonly diagnostics: Diagnostic[];
  /** Drifted resources from `resource_drift` messages. */
  readonly driftChanges: PlannedChange[];
  /** Summary counts from the last `change_summary` message. */
  readonly changeSummary?: UIChangeSummary;
  /** Output values from the last `outputs` message. */
  readonly outputsMessage?: UIOutputsMessage;
  /** Detected tool from the `version` message. */
  readonly tool?: Tool;

  // ── Quality tracking (→ report.warnings) ────────────────────────────────

  /** Total non-empty lines processed. */
  readonly totalLines: number;
  /** Lines successfully parsed as known message types. */
  readonly parsedLines: number;
  /** Lines with valid JSON and a `type` field but unrecognized type value. */
  readonly unknownTypeLines: number;
  /** Lines that are not valid JSON or lack a `type` field. */
  readonly unparseableLines: number;
}
