/**
 * Type definitions for Terraform/OpenTofu machine-readable UI output.
 *
 * Both Terraform and OpenTofu support a `-json` flag on `init`, `plan`, `apply`,
 * and several other commands. This produces structured log output as JSON Lines
 * (one JSON object per line). These types model the wire format of that output.
 *
 * The `validate -json` command is a special case: it emits a single JSON object
 * rather than JSON Lines. See `validate-output.ts` for those types.
 *
 * Source references (pinned commits):
 *   - OpenTofu:   github.com/opentofu/opentofu @ 0e26f19aa0f669eb839144db92fd4e86e68556a0
 *     - views/json/message_types.go, views/json/change.go, views/json/diagnostic.go
 *   - Terraform:  github.com/hashicorp/terraform @ 2f3a862f8053aeac68bd9faa002a48a1bd31e5f6
 *     - views/json/message_types.go, views/json/change.go, views/json/diagnostic.go
 */

import type { JsonValue } from "./common.js";

// ─── Shared Payloads ────────────────────────────────────────────────────────

/**
 * Resource address payload shared across planned_change, apply hooks,
 * and provisioner hooks. Identifies a single resource instance.
 */
export interface UIResourceAddr {
  /** Full resource address (e.g. "module.child.aws_instance.web[0]"). */
  readonly addr: string;
  /** Module portion of the address ("" for root module). */
  readonly module: string;
  /** Resource portion of the address within its module. */
  readonly resource: string;
  /** Provider implied by the resource type name. */
  readonly implied_provider: string;
  /** Resource type (e.g. "aws_instance", "null_resource"). */
  readonly resource_type: string;
  /** Logical resource name within the configuration. */
  readonly resource_name: string;
  /** Instance key for indexed resources (count or for_each); null for non-keyed. */
  readonly resource_key: string | number | null;
}

// ─── Change Action (UI) ────────────────────────────────────────────────────

/**
 * Change action strings used in the machine-readable UI output.
 *
 * These are similar to but NOT identical to the plan JSON Change.actions tuples.
 * In the UI output, "replace" is a single string; in plan JSON it is a 2-element
 * tuple like `["delete", "create"]`. The UI format also includes additional
 * values like "move", "import", and "remove" that don't appear in Change.actions.
 */
export const UIChangeAction = {
  NoOp: "noop",
  Create: "create",
  Read: "read",
  Update: "update",
  Delete: "delete",
  Replace: "replace",
  Move: "move",
  Import: "import",
  Remove: "remove",
  Forget: "forget",
} as const;

export type UIChangeAction = typeof UIChangeAction[keyof typeof UIChangeAction];

// ─── Change Reason (UI) ────────────────────────────────────────────────────

/**
 * Reason strings explaining why a particular action was planned. These are
 * optional display hints — not all planned_change messages include a reason.
 *
 * Both tools may add new values in future versions; consumers should treat
 * unrecognized values gracefully.
 */
export const UIChangeReason = {
  CannotUpdate: "cannot_update",
  Tainted: "tainted",
  Requested: "requested",
  ReplacedByTriggers: "replace_by_triggers",
  DeleteBecauseNoResourceConfig: "delete_because_no_resource_config",
  DeleteBecauseNoModule: "delete_because_no_module",
  DeleteBecauseWrongRepetition: "delete_because_wrong_repetition",
  DeleteBecauseCountIndex: "delete_because_count_index",
  DeleteBecauseEachKey: "delete_because_each_key",
  DeleteBecauseNoMoveTarget: "delete_because_no_move_target",
  ReadBecauseConfigUnknown: "read_because_config_unknown",
  ReadBecauseDependencyPending: "read_because_dependency_pending",
  ReadBecauseCheckNested: "read_because_check_nested",
} as const;

export type UIChangeReason = typeof UIChangeReason[keyof typeof UIChangeReason];

// ─── Diagnostic ─────────────────────────────────────────────────────────────

/**
 * Source code location range, pointing to the start and end positions of
 * the relevant code in a configuration file.
 */
export interface UIDiagnosticRange {
  readonly filename: string;
  readonly start: UIDiagnosticPos;
  readonly end: UIDiagnosticPos;
}

/** A byte-offset position within a source file. */
export interface UIDiagnosticPos {
  readonly line: number;
  readonly column: number;
  readonly byte: number;
}

/**
 * Source code snippet providing context for a diagnostic. Included when the
 * diagnostic can be traced to a specific location in configuration.
 */
export interface UIDiagnosticSnippet {
  /** Surrounding HCL context (e.g. `resource "aws_instance" "web"`). */
  readonly context: string;
  /** The line of source code containing the problem. */
  readonly code: string;
  /** Starting line number in the source file. */
  readonly start_line: number;
  /** Byte offset within `code` where the highlighted region begins. */
  readonly highlight_start_offset: number;
  /** Byte offset within `code` where the highlighted region ends. */
  readonly highlight_end_offset: number;
  /** Expression values referenced in the diagnostic. */
  readonly values: readonly { readonly traversal: string; readonly statement: string }[];
}

/**
 * Wire-format diagnostic emitted by both tools. Diagnostics represent errors,
 * warnings, or (rarely) informational messages from the tool.
 *
 * The `summary` and `detail` fields may be shown to users. Both tools already
 * mask sensitive values in diagnostic output, so these strings are safe to
 * display without additional masking.
 */
export interface UIDiagnostic {
  readonly severity: "error" | "warning";
  readonly summary: string;
  readonly detail: string;
  /** Resource address this diagnostic pertains to (if applicable). */
  readonly address?: string;
  /** Source code range (if the diagnostic is tied to a specific location). */
  readonly range?: UIDiagnosticRange;
  /** Source code snippet for display context. */
  readonly snippet?: UIDiagnosticSnippet;
}

// ─── Change Summary ─────────────────────────────────────────────────────────

/**
 * Summary counts emitted at the end of plan and apply operations.
 * Terraform 1.3+ also includes `action_invocation`.
 */
export interface UIChangeSummary {
  readonly add: number;
  readonly change: number;
  readonly import: number;
  readonly remove: number;
  /** Terraform 1.3+ only; absent in OpenTofu. */
  readonly action_invocation?: number;
  /** The operation that produced this summary. */
  readonly operation: "plan" | "apply" | "destroy";
}

// ─── Output Value ───────────────────────────────────────────────────────────

/**
 * A single output value as reported in the `outputs` message.
 *
 * For sensitive outputs, `sensitive` is `true` and `value` is omitted (or null).
 * Consumers must check the `sensitive` flag and never attempt to read the value
 * of sensitive outputs.
 */
export interface UIOutputValue {
  readonly sensitive: boolean;
  /** CTY type descriptor (e.g. "string", ["list", "string"]). */
  readonly type?: JsonValue;
  /** The resolved output value. Absent or null for sensitive outputs. */
  readonly value?: JsonValue;
  /** Change action for this output (present in plan output messages). */
  readonly action?: UIChangeAction;
}

// ─── Message Payloads ───────────────────────────────────────────────────────

/**
 * Common envelope fields present on every JSON line message.
 * The `type` discriminant identifies the message kind.
 */
interface UIMessageBase {
  /** Log level (typically "info"; "error" for diagnostics). */
  readonly "@level": string;
  /** Human-readable message summary. */
  readonly "@message": string;
  /** Module that produced the message ("terraform.ui" or "tofu.ui"). */
  readonly "@module": string;
  /** ISO 8601 timestamp. */
  readonly "@timestamp": string;
}

/**
 * Version message — always the first line of any `-json` command output.
 * Identifies the tool and the UI protocol version.
 */
export interface UIVersionMessage extends UIMessageBase {
  readonly type: "version";
  /** Terraform version string (absent for OpenTofu). */
  readonly terraform?: string;
  /** OpenTofu version string (absent for Terraform). */
  readonly tofu?: string;
  /** Machine-readable UI protocol version. */
  readonly ui: string;
}

/** General log message (free-form informational text). */
export interface UILogMessage extends UIMessageBase {
  readonly type: "log";
}

/** Diagnostic message wrapping an error or warning. */
export interface UIDiagnosticMessage extends UIMessageBase {
  readonly type: "diagnostic";
  readonly diagnostic: UIDiagnostic;
}

// ─── Plan Messages ──────────────────────────────────────────────────────────

/** Emitted during plan and at the start of apply for each planned resource change. */
export interface UIPlannedChangeMessage extends UIMessageBase {
  readonly type: "planned_change";
  readonly change: {
    readonly resource: UIResourceAddr;
    readonly action: UIChangeAction;
    readonly reason?: string;
  };
}

/** Summary of all changes at the end of plan or apply. */
export interface UIChangeSummaryMessage extends UIMessageBase {
  readonly type: "change_summary";
  readonly changes: UIChangeSummary;
}

// ─── Apply Hook Messages ────────────────────────────────────────────────────

/** Emitted when a resource operation begins during apply. */
export interface UIApplyStartMessage extends UIMessageBase {
  readonly type: "apply_start";
  readonly hook: {
    readonly resource: UIResourceAddr;
    readonly action: UIChangeAction;
    /** Primary key attribute name (e.g. "id"). */
    readonly id_key?: string;
    /** Primary key attribute value. */
    readonly id_value?: string;
  };
}

/** Emitted periodically during long-running apply operations. */
export interface UIApplyProgressMessage extends UIMessageBase {
  readonly type: "apply_progress";
  readonly hook: {
    readonly resource: UIResourceAddr;
    readonly action: UIChangeAction;
    readonly elapsed_seconds: number;
  };
}

/** Emitted when a resource operation completes successfully. */
export interface UIApplyCompleteMessage extends UIMessageBase {
  readonly type: "apply_complete";
  readonly hook: {
    readonly resource: UIResourceAddr;
    readonly action: UIChangeAction;
    readonly id_key?: string;
    readonly id_value?: string;
    readonly elapsed_seconds: number;
  };
}

/** Emitted when a resource operation fails during apply. */
export interface UIApplyErroredMessage extends UIMessageBase {
  readonly type: "apply_errored";
  readonly hook: {
    readonly resource: UIResourceAddr;
    readonly action: UIChangeAction;
    readonly elapsed_seconds: number;
  };
}

// ─── Provisioner Hook Messages ──────────────────────────────────────────────

/** Emitted when a provisioner starts executing. */
export interface UIProvisionStartMessage extends UIMessageBase {
  readonly type: "provision_start";
  readonly hook: {
    readonly resource: UIResourceAddr;
    readonly provisioner: string;
  };
}

/** Emitted for each line of provisioner output. */
export interface UIProvisionProgressMessage extends UIMessageBase {
  readonly type: "provision_progress";
  readonly hook: {
    readonly resource: UIResourceAddr;
    readonly provisioner: string;
    readonly output: string;
  };
}

/** Emitted when a provisioner completes successfully. */
export interface UIProvisionCompleteMessage extends UIMessageBase {
  readonly type: "provision_complete";
  readonly hook: {
    readonly resource: UIResourceAddr;
    readonly provisioner: string;
  };
}

/** Emitted when a provisioner fails. */
export interface UIProvisionErroredMessage extends UIMessageBase {
  readonly type: "provision_errored";
  readonly hook: {
    readonly resource: UIResourceAddr;
    readonly provisioner: string;
  };
}

// ─── Refresh Hook Messages ──────────────────────────────────────────────────

/** Emitted when a resource refresh starts. */
export interface UIRefreshStartMessage extends UIMessageBase {
  readonly type: "refresh_start";
  readonly hook: {
    readonly resource: UIResourceAddr;
    readonly id_key?: string;
    readonly id_value?: string;
  };
}

/** Emitted when a resource refresh completes. */
export interface UIRefreshCompleteMessage extends UIMessageBase {
  readonly type: "refresh_complete";
  readonly hook: {
    readonly resource: UIResourceAddr;
    readonly id_key?: string;
    readonly id_value?: string;
  };
}

// ─── Output Messages ────────────────────────────────────────────────────────

/** Emitted at the end of apply (or plan) with the resolved output values. */
export interface UIOutputsMessage extends UIMessageBase {
  readonly type: "outputs";
  readonly outputs: { readonly [name: string]: UIOutputValue };
}

// ─── Init Messages ──────────────────────────────────────────────────────────

/**
 * Init-specific structured message. Uses a `message_code` to identify the
 * type of init event, with the human-readable text in `@message`.
 */
export interface UIInitOutputMessage extends UIMessageBase {
  readonly type: "init_output";
  readonly message_code: string;
}

// ─── Discriminated Union ────────────────────────────────────────────────────

/**
 * Discriminated union of all known machine-readable UI message types.
 *
 * Consumers should match on `type` and handle unknown types gracefully
 * (both tools may add new types in future versions). The `UIUnknownMessage`
 * variant covers messages with unrecognized type values.
 */
export type UIMessage =
  | UIVersionMessage
  | UILogMessage
  | UIDiagnosticMessage
  | UIPlannedChangeMessage
  | UIChangeSummaryMessage
  | UIApplyStartMessage
  | UIApplyProgressMessage
  | UIApplyCompleteMessage
  | UIApplyErroredMessage
  | UIProvisionStartMessage
  | UIProvisionProgressMessage
  | UIProvisionCompleteMessage
  | UIProvisionErroredMessage
  | UIRefreshStartMessage
  | UIRefreshCompleteMessage
  | UIOutputsMessage
  | UIInitOutputMessage
  | UIUnknownMessage;

/**
 * Catch-all for messages with an unrecognized `type` value. This allows
 * parsers to preserve unknown messages without losing data, while still
 * providing type safety for known message types.
 */
export interface UIUnknownMessage extends UIMessageBase {
  readonly type: string;
  readonly [key: string]: JsonValue | undefined;
}
