/**
 * Constants for Terraform/OpenTofu JSON plan representations.
 * 
 * All string constants are defined as const objects with union types derived
 * from them, providing both runtime values and compile-time type checking.
 */

// ─── Format Versions ────────────────────────────────────────────────────────

/** Format version for plan JSON (currently "1.2" in both tools' source) */
export const PLAN_FORMAT_VERSION = "1.2";

/** Format version for state JSON (currently "1.0" in both tools) */
export const STATE_FORMAT_VERSION = "1.0";

// ─── Resource Modes ─────────────────────────────────────────────────────────

export const ResourceMode = {
  Managed: "managed",
  Data: "data",
  Ephemeral: "ephemeral",
} as const;

export type ResourceMode = typeof ResourceMode[keyof typeof ResourceMode];

// ─── Change Actions ─────────────────────────────────────────────────────────

export const Action = {
  NoOp: "no-op",
  Create: "create",
  Read: "read",
  Update: "update",
  Delete: "delete",
  Forget: "forget",
} as const;

export type Action = typeof Action[keyof typeof Action];

// ─── Action Reasons ─────────────────────────────────────────────────────────

/**
 * ActionReason provides extra context for why a particular action was chosen.
 * These are display hints only — the set may grow in future versions.
 * Always treat unrecognized values as an unspecified reason.
 */
export const ActionReason = {
  // BOTH tools
  ReplaceBecauseCannotUpdate: "replace_because_cannot_update",
  ReplaceBecauseTainted: "replace_because_tainted",
  ReplaceByRequest: "replace_by_request",
  ReplaceByTriggers: "replace_by_triggers",
  DeleteBecauseNoResourceConfig: "delete_because_no_resource_config",
  DeleteBecauseNoModule: "delete_because_no_module",
  DeleteBecauseWrongRepetition: "delete_because_wrong_repetition",
  DeleteBecauseCountIndex: "delete_because_count_index",
  DeleteBecauseEachKey: "delete_because_each_key",
  DeleteBecauseNoMoveTarget: "delete_because_no_move_target",
  ReadBecauseConfigUnknown: "read_because_config_unknown",
  ReadBecauseDependencyPending: "read_because_dependency_pending",
  ReadBecauseCheckNested: "read_because_check_nested",
  
  // OPENTOFU ONLY
  DeleteBecauseEnabledFalse: "delete_because_enabled_false",
  ForgotBecauseLifecycleDestroyInState: "forgot_because_lifecycle_destroy_in_state",
  ForgotBecauseLifecycleDestroyInConfig: "forgot_because_lifecycle_destroy_in_config",
} as const;

export type ActionReason = typeof ActionReason[keyof typeof ActionReason];

// ─── Deferred Reasons (Terraform only) ──────────────────────────────────────

/**
 * DeferredReason indicates why a resource change or action invocation was
 * deferred to a future plan/apply cycle.
 * 
 * TERRAFORM ONLY — OpenTofu does not have deferred changes.
 */
export const DeferredReason = {
  Unknown: "unknown",
  InstanceCountUnknown: "instance_count_unknown",
  ResourceConfigUnknown: "resource_config_unknown",
  ProviderConfigUnknown: "provider_config_unknown",
  DeferredPrereq: "deferred_prereq",
  AbsentPrereq: "absent_prereq",
} as const;

export type DeferredReason = typeof DeferredReason[keyof typeof DeferredReason];

// ─── Check Statuses ─────────────────────────────────────────────────────────

/**
 * CheckStatus represents the evaluation status of a checkable object.
 */
export const CheckStatus = {
  Pass: "pass",
  Fail: "fail",
  Error: "error",
  Unknown: "unknown",
} as const;

export type CheckStatus = typeof CheckStatus[keyof typeof CheckStatus];

// ─── Check Address Kinds ────────────────────────────────────────────────────

/**
 * CheckKind identifies the type of checkable object.
 */
export const CheckKind = {
  Resource: "resource",
  OutputValue: "output_value",
  Check: "check",
  Var: "var",  // OPENTOFU ONLY
} as const;

export type CheckKind = typeof CheckKind[keyof typeof CheckKind];
