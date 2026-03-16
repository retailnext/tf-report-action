/**
 * tfjson - TypeScript types for Terraform/OpenTofu JSON output
 *
 * This package provides strongly-typed TypeScript interfaces for parsing JSON
 * output from both OpenTofu and Terraform, covering:
 *   - Plan JSON output (`show -json <planfile>`)
 *   - Machine-readable UI output (`-json` flag on init, plan, apply)
 *   - Validate output (`validate -json`)
 *
 * The two tools produce very similar output — OpenTofu forked from Terraform and
 * maintains broad compatibility. This package uses a single unified set of
 * interfaces; fields that are only emitted by one tool are simply undefined when
 * parsing output from the other.
 *
 * Key features:
 *   - No `any` types — precise union types for all JSON structures
 *   - Change actions as discriminated tuple unions
 *   - Recursive types for cty type descriptors and shadow structures
 *   - Constants as `as const` objects with derived union types
 *   - Discriminated unions for machine-readable UI message types
 *   - Comprehensive documentation on every field
 *
 * Source references (pinned commits):
 *   - OpenTofu:   github.com/opentofu/opentofu @ 0e26f19aa0f669eb839144db92fd4e86e68556a0
 *   - Terraform:  github.com/hashicorp/terraform @ 2f3a862f8053aeac68bd9faa002a48a1bd31e5f6
 */

// ─── Common Types ───────────────────────────────────────────────────────────

export type {
  JsonValue,
  JsonArray,
  JsonObject,
  CtyPrimitive,
  CtyType,
  AttributeValues,
  AttributeShadow,
  AttributeShadowMap,
  ChangeActions,
  ConfigExpression,
  ConfigExpressionBlock,
  ConfigExpressions,
} from "./common";

// ─── Constants ──────────────────────────────────────────────────────────────

export {
  PLAN_FORMAT_VERSION,
  STATE_FORMAT_VERSION,
  ResourceMode,
  Action,
  ActionReason,
  DeferredReason,
  CheckStatus,
  CheckKind,
} from "./constants";

export type {
  ResourceMode as ResourceModeType,
  Action as ActionType,
  ActionReason as ActionReasonType,
  DeferredReason as DeferredReasonType,
  CheckStatus as CheckStatusType,
  CheckKind as CheckKindType,
} from "./constants";

// ─── Expression ─────────────────────────────────────────────────────────────

export type { Expression } from "./expression";

// ─── Checks ─────────────────────────────────────────────────────────────────

export type {
  CheckResult,
  CheckAddress,
  CheckInstance,
  CheckInstanceAddress,
  CheckProblem,
} from "./checks";

// ─── Plan ───────────────────────────────────────────────────────────────────

export type {
  Plan,
  PlanVariable,
  ResourceAttr,
  Change,
  Importing,
} from "./plan";

// ─── Resource Changes ───────────────────────────────────────────────────────

export type { ResourceChange, DeferredResourceChange } from "./resource";

// ─── Values ─────────────────────────────────────────────────────────────────

export type {
  StateValues,
  ValuesOutput,
  ValuesModule,
  ValueResource,
} from "./values";

// ─── State ──────────────────────────────────────────────────────────────────

export type { State } from "./state";

// ─── Configuration ──────────────────────────────────────────────────────────

export type {
  Config,
  ProviderConfig,
  ConfigModule,
  ModuleCall,
  ConfigResource,
  ConfigOutput,
  ConfigVariable,
  ConfigAction,
  Provisioner,
} from "./config";

// ─── Action Invocations (Terraform only) ────────────────────────────────────

export type {
  ActionInvocation,
  LifecycleActionTrigger,
  InvokeActionTrigger,
  DeferredActionInvocation,
} from "./action_invocations";

// ─── Machine-Readable UI Output ─────────────────────────────────────────────

export { UIChangeAction, UIChangeReason } from "./machine-readable-ui";

export type {
  UIChangeAction as UIChangeActionType,
  UIChangeReason as UIChangeReasonType,
  UIResourceAddr,
  UIDiagnosticRange,
  UIDiagnosticPos,
  UIDiagnosticSnippet,
  UIDiagnostic,
  UIChangeSummary,
  UIOutputValue,
  UIMessage,
  UIVersionMessage,
  UILogMessage,
  UIDiagnosticMessage,
  UIPlannedChangeMessage,
  UIChangeSummaryMessage,
  UIApplyStartMessage,
  UIApplyProgressMessage,
  UIApplyCompleteMessage,
  UIApplyErroredMessage,
  UIProvisionStartMessage,
  UIProvisionProgressMessage,
  UIProvisionCompleteMessage,
  UIProvisionErroredMessage,
  UIRefreshStartMessage,
  UIRefreshCompleteMessage,
  UIOutputsMessage,
  UIInitOutputMessage,
  UIUnknownMessage,
} from "./machine-readable-ui";

// ─── Validate Output ────────────────────────────────────────────────────────

export { VALIDATE_FORMAT_VERSION } from "./validate-output";

export type { ValidateOutput } from "./validate-output";
