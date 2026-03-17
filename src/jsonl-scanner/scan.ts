/**
 * The unified JSONL scanner. This is the **single** JSON Lines processing
 * path for all flows — replaces `parseUILog`, `tryFormatJsonLines`, and
 * the extraction helpers in `builder/apply.ts`.
 *
 * Two modes:
 * - `scanString(content)` — processes an in-memory string (for the library
 *   API callers like `applyToMarkdown`).
 * - `scanFile(filePath, maxFileSize)` — reads a file in 64 KiB chunks via
 *   synchronous I/O, processing one line at a time. Never loads the entire
 *   file into memory. Safe for 10,000+ resource workspaces with hundreds of
 *   megabytes of JSONL output.
 *
 * Both return the same `ScanResult`.
 *
 * @module jsonl-scanner/scan
 */

import { openSync, readSync, closeSync, fstatSync } from "node:fs";

import type { Diagnostic } from "../model/diagnostic.js";
import type { ApplyStatus } from "../model/apply-status.js";
import type { Tool } from "../model/report.js";
import type { PlanAction } from "../model/plan-action.js";
import type {
  UIChangeSummary,
  UIOutputsMessage,
} from "../tfjson/machine-readable-ui.js";
import type { PlannedChange, ScanResult } from "./types.js";

/** Size of each read chunk for file-based scanning. */
const CHUNK_SIZE = 64 * 1024; // 64 KiB

// ─── Known Skippable Types ──────────────────────────────────────────────────

/**
 * Message types that are valid JSONL but carry no information needed for the
 * report. The scanner counts them as parsed but does not extract records.
 */
const SKIPPABLE_TYPES = new Set([
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

// ─── Mutable Accumulator ────────────────────────────────────────────────────

/** Internal mutable accumulator used during scanning. */
interface ScanAccumulator {
  plannedChanges: PlannedChange[];
  applyStatuses: ApplyStatus[];
  diagnostics: Diagnostic[];
  driftChanges: PlannedChange[];
  changeSummary: UIChangeSummary | undefined;
  outputsMessage: UIOutputsMessage | undefined;
  tool: Tool | undefined;
  totalLines: number;
  parsedLines: number;
  unknownTypeLines: number;
  unparseableLines: number;
}

/** Creates a fresh zero-state accumulator. */
function createAccumulator(): ScanAccumulator {
  return {
    plannedChanges: [],
    applyStatuses: [],
    diagnostics: [],
    driftChanges: [],
    changeSummary: undefined,
    outputsMessage: undefined,
    tool: undefined,
    totalLines: 0,
    parsedLines: 0,
    unknownTypeLines: 0,
    unparseableLines: 0,
  };
}

/** Freezes the mutable accumulator into an immutable ScanResult. */
function toScanResult(acc: ScanAccumulator): ScanResult {
  return {
    plannedChanges: acc.plannedChanges,
    applyStatuses: acc.applyStatuses,
    diagnostics: acc.diagnostics,
    driftChanges: acc.driftChanges,
    totalLines: acc.totalLines,
    parsedLines: acc.parsedLines,
    unknownTypeLines: acc.unknownTypeLines,
    unparseableLines: acc.unparseableLines,
    ...(acc.changeSummary !== undefined
      ? { changeSummary: acc.changeSummary }
      : {}),
    ...(acc.outputsMessage !== undefined
      ? { outputsMessage: acc.outputsMessage }
      : {}),
    ...(acc.tool !== undefined ? { tool: acc.tool } : {}),
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Scans a JSON Lines string in memory. Splits on newlines and processes
 * each line.
 *
 * Use this for the library API (`applyToMarkdown`) where the caller has
 * already loaded the JSONL into a string.
 */
export function scanString(content: string): ScanResult {
  const acc = createAccumulator();
  const lines = content.split("\n");
  for (const line of lines) {
    processLine(acc, line);
  }
  return toScanResult(acc);
}

/**
 * Scans a JSON Lines file using synchronous chunked I/O (64 KiB reads).
 * Never loads the entire file into memory.
 *
 * @param filePath    - Absolute path to the JSONL file.
 * @param maxFileSize - Maximum file size in bytes. Files exceeding this are
 *                      not scanned (returns an empty ScanResult). This is a
 *                      safety limit, not a memory limit — the scanner uses
 *                      constant memory regardless of file size.
 * @throws {Error} If the file cannot be opened or read.
 */
export function scanFile(filePath: string, maxFileSize: number): ScanResult {
  const acc = createAccumulator();
  const fd = openSync(filePath, "r");
  try {
    const stat = fstatSync(fd);
    if (stat.size > maxFileSize) {
      return toScanResult(acc);
    }

    const buf = Buffer.alloc(CHUNK_SIZE);
    let remainder = "";

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- readSync returns 0 at EOF
    while (true) {
      const bytesRead = readSync(fd, buf, 0, CHUNK_SIZE, null);
      if (bytesRead === 0) break;

      const chunk = remainder + buf.toString("utf8", 0, bytesRead);
      const lines = chunk.split("\n");

      // Last element is either empty (chunk ended with \n) or an incomplete line
      remainder = lines.pop() ?? "";

      for (const line of lines) {
        processLine(acc, line);
      }
    }

    // Process the final remainder (last line without trailing newline)
    if (remainder.length > 0) {
      processLine(acc, remainder);
    }
  } finally {
    closeSync(fd);
  }

  return toScanResult(acc);
}

// ─── Line Processing ────────────────────────────────────────────────────────

/**
 * Processes a single line of JSONL output. Dispatches based on `type` field.
 *
 * Error messages never include raw line content (which may contain sensitive
 * plan attribute values).
 */
function processLine(acc: ScanAccumulator, rawLine: string): void {
  const line = rawLine.trim();
  if (line === "") return;

  acc.totalLines++;

  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    acc.unparseableLines++;
    return;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    acc.unparseableLines++;
    return;
  }

  const obj = parsed as Record<string, unknown>;
  const type = obj["type"];
  if (typeof type !== "string") {
    acc.unparseableLines++;
    return;
  }

  // Dispatch based on message type
  switch (type) {
    case "version":
      processVersion(acc, obj);
      break;
    case "planned_change":
      processPlannedChange(acc, obj, "plannedChanges");
      break;
    case "resource_drift":
      processPlannedChange(acc, obj, "driftChanges");
      break;
    case "change_summary":
      processChangeSummary(acc, obj);
      break;
    case "apply_complete":
      processApplyComplete(acc, obj);
      break;
    case "apply_errored":
      processApplyErrored(acc, obj);
      break;
    case "diagnostic":
      processDiagnostic(acc, obj);
      break;
    case "outputs":
      processOutputs(acc, obj);
      break;
    default:
      if (SKIPPABLE_TYPES.has(type)) {
        acc.parsedLines++;
      } else {
        acc.unknownTypeLines++;
      }
      return;
  }

  acc.parsedLines++;
}

// ─── Message Processors ─────────────────────────────────────────────────────

/** Extracts tool info from the `version` message. */
function processVersion(
  acc: ScanAccumulator,
  obj: Record<string, unknown>,
): void {
  if (typeof obj["tofu"] === "string") {
    acc.tool = "tofu";
  } else if (typeof obj["terraform"] === "string") {
    acc.tool = "terraform";
  }
}

/**
 * Extracts a resource change from `planned_change` or `resource_drift` messages.
 * Both have the same structure: `{ change: { resource: UIResourceAddr, action, reason? } }`.
 */
function processPlannedChange(
  acc: ScanAccumulator,
  obj: Record<string, unknown>,
  target: "plannedChanges" | "driftChanges",
): void {
  const change = obj["change"];
  if (typeof change !== "object" || change === null) return;

  const changeObj = change as Record<string, unknown>;
  const resource = changeObj["resource"];
  if (typeof resource !== "object" || resource === null) return;

  const resourceObj = resource as Record<string, unknown>;
  const addr = resourceObj["addr"];
  const resourceType = resourceObj["resource_type"];
  const module = resourceObj["module"];
  const action = changeObj["action"];

  if (typeof addr !== "string" || typeof action !== "string") return;

  const entry: PlannedChange = {
    address: addr,
    resourceType: typeof resourceType === "string" ? resourceType : "",
    module: typeof module === "string" ? module : "",
    action: uiActionToPlanAction(action),
    ...(typeof changeObj["reason"] === "string"
      ? { reason: changeObj["reason"] }
      : {}),
  };

  acc[target].push(entry);
}

/** Extracts summary counts from the `change_summary` message. */
function processChangeSummary(
  acc: ScanAccumulator,
  obj: Record<string, unknown>,
): void {
  const changes = obj["changes"];
  if (typeof changes !== "object" || changes === null) return;

  // UIChangeSummary structure — trust the wire format
  acc.changeSummary = changes as UIChangeSummary;
}

/** Extracts a successful apply outcome from the `apply_complete` message. */
function processApplyComplete(
  acc: ScanAccumulator,
  obj: Record<string, unknown>,
): void {
  const hook = obj["hook"];
  if (typeof hook !== "object" || hook === null) return;

  const hookObj = hook as Record<string, unknown>;
  const resource = hookObj["resource"];
  if (typeof resource !== "object" || resource === null) return;

  const resourceObj = resource as Record<string, unknown>;
  const addr = resourceObj["addr"];
  const action = hookObj["action"];

  if (typeof addr !== "string" || typeof action !== "string") return;

  const status: ApplyStatus = {
    address: addr,
    action: uiActionToPlanAction(action),
    success: true,
    ...(typeof hookObj["elapsed_seconds"] === "number"
      ? { elapsed: hookObj["elapsed_seconds"] }
      : {}),
    ...(typeof hookObj["id_key"] === "string"
      ? { idKey: hookObj["id_key"] }
      : {}),
    ...(typeof hookObj["id_value"] === "string"
      ? { idValue: hookObj["id_value"] }
      : {}),
  };

  // Last outcome per address wins (handles replace = delete + create)
  const existing = acc.applyStatuses.findIndex((s) => s.address === addr);
  if (existing >= 0) {
    acc.applyStatuses[existing] = status;
  } else {
    acc.applyStatuses.push(status);
  }
}

/** Extracts a failed apply outcome from the `apply_errored` message. */
function processApplyErrored(
  acc: ScanAccumulator,
  obj: Record<string, unknown>,
): void {
  const hook = obj["hook"];
  if (typeof hook !== "object" || hook === null) return;

  const hookObj = hook as Record<string, unknown>;
  const resource = hookObj["resource"];
  if (typeof resource !== "object" || resource === null) return;

  const resourceObj = resource as Record<string, unknown>;
  const addr = resourceObj["addr"];
  const action = hookObj["action"];

  if (typeof addr !== "string" || typeof action !== "string") return;

  const status: ApplyStatus = {
    address: addr,
    action: uiActionToPlanAction(action),
    success: false,
    ...(typeof hookObj["elapsed_seconds"] === "number"
      ? { elapsed: hookObj["elapsed_seconds"] }
      : {}),
  };

  const existing = acc.applyStatuses.findIndex((s) => s.address === addr);
  if (existing >= 0) {
    acc.applyStatuses[existing] = status;
  } else {
    acc.applyStatuses.push(status);
  }
}

/**
 * Extracts a diagnostic (error or warning) from the `diagnostic` message.
 * Carries range and snippet when present — richer than plan JSON diagnostics.
 *
 * Note: `source` is NOT set here. The scanner is step-unaware; the builder
 * sets `source: "plan"` or `source: "apply"` after scanning.
 */
function processDiagnostic(
  acc: ScanAccumulator,
  obj: Record<string, unknown>,
): void {
  const diagnostic = obj["diagnostic"];
  if (typeof diagnostic !== "object" || diagnostic === null) return;

  const diagObj = diagnostic as Record<string, unknown>;
  const severity = diagObj["severity"];
  const summary = diagObj["summary"];

  if (severity !== "error" && severity !== "warning") return;
  if (typeof summary !== "string") return;

  const range = diagObj["range"];
  const snippet = diagObj["snippet"];

  // Build up the diagnostic object. Optional fields use conditional assignment
  // to avoid `undefined` values (required by exactOptionalPropertyTypes).
  const base: Record<string, unknown> = {
    severity,
    summary,
    detail: typeof diagObj["detail"] === "string" ? diagObj["detail"] : "",
  };
  if (typeof diagObj["address"] === "string")
    base["address"] = diagObj["address"];
  if (isRange(range)) base["range"] = range;
  if (isSnippet(snippet)) base["snippet"] = snippet;

  const diag = base as unknown as Diagnostic;

  acc.diagnostics.push(diag);
}

/** Stores the `outputs` message (last one wins). */
function processOutputs(
  acc: ScanAccumulator,
  obj: Record<string, unknown>,
): void {
  // Trust the wire format — the full UIOutputsMessage structure is preserved
  // for downstream processing by the builder.
  acc.outputsMessage = obj as unknown as UIOutputsMessage;
}

// ─── Action Mapping ─────────────────────────────────────────────────────────

/**
 * Maps a UI change action string to the model's `PlanAction`.
 *
 * In the UI JSONL, forget operations are emitted as `"remove"` in
 * `planned_change` messages (distinct from `"delete"` for actual destroys).
 * Both are mapped to `"forget"`.
 */
function uiActionToPlanAction(action: string): PlanAction {
  switch (action) {
    case "create":
      return "create";
    case "update":
      return "update";
    case "delete":
      return "delete";
    case "replace":
      return "replace";
    case "read":
      return "read";
    case "noop":
      return "no-op";
    case "forget":
      return "forget";
    case "remove":
      return "forget";
    case "move":
      return "move";
    case "import":
      return "import";
    default:
      return "unknown";
  }
}

// ─── Structural Guards ──────────────────────────────────────────────────────

/** Checks if a value looks like a UIDiagnosticRange. */
function isRange(value: unknown): value is Diagnostic["range"] {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["filename"] === "string" && typeof obj["start"] === "object"
  );
}

/** Checks if a value looks like a UIDiagnosticSnippet. */
function isSnippet(value: unknown): value is Diagnostic["snippet"] {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["code"] === "string" && typeof obj["start_line"] === "number"
  );
}
