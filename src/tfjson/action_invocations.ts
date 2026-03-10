/**
 * Action invocation types for Terraform JSON plans.
 * 
 * TERRAFORM ONLY — OpenTofu does not have action blocks or action invocations.
 * All types in this file will be unpopulated when parsing OpenTofu plan output.
 */

import { AttributeValues, AttributeShadow } from "./common";

/**
 * ActionInvocation describes a single invocation of a provider-defined action
 * that will occur when this plan is applied. Actions are provider-defined
 * operations (e.g. sending notifications, triggering deployments) that are
 * distinct from resource lifecycle management — they do not create or manage
 * state.
 * 
 * Action invocations can be triggered in two ways:
 *  1. By a resource's lifecycle event (create, update, or delete) via a
 *     lifecycle action_trigger block — represented by lifecycle_action_trigger.
 *  2. Directly (e.g. via an invoke_action block) — represented by
 *     invoke_action_trigger.
 * 
 * Exactly one of lifecycle_action_trigger or invoke_action_trigger will be non-null.
 * 
 * TERRAFORM ONLY — OpenTofu does not have action blocks or action invocations.
 */
export interface ActionInvocation {
  /**
   * address is the absolute address of the action instance being invoked,
   * e.g. "aws_sesv2_send_email.notify" or
   * "module.child.aws_sesv2_send_email.notify[0]".
   */
  address?: string;

  /**
   * type is the action type as defined by the provider (the first label in
   * the action block).
   */
  type?: string;

  /**
   * name is the action name label (the second label in the action block).
   */
  name?: string;

  /**
   * config_values is the JSON-encoded configuration values passed to this
   * action invocation. Unknown values are omitted (replaced with null); use
   * config_unknown to identify which values are unknown. Sensitive values are
   * replaced with null; use config_sensitive to identify them.
   */
  config_values?: AttributeValues | null;

  /**
   * config_sensitive mirrors the structure of config_values but contains only
   * sensitive leaf attributes, each set to true. Non-sensitive leaves are
   * omitted. Use this alongside config_values to prevent accidental display of
   * sensitive action parameters.
   */
  config_sensitive?: AttributeShadow | null;

  /**
   * config_unknown mirrors the structure of config_values but contains true for
   * any leaf attribute whose value will only be known after apply. Omitted
   * leaves are known. Combine with config_values for a complete picture.
   */
  config_unknown?: AttributeShadow | null;

  /**
   * provider_name is the fully-qualified provider source address for the
   * provider that implements this action type. Do not hardcode the registry
   * hostname — it differs between tools.
   */
  provider_name?: string;

  /**
   * lifecycle_action_trigger is populated when this action invocation is
   * triggered by a resource lifecycle event. Exactly one of
   * lifecycle_action_trigger and invoke_action_trigger will be non-null.
   */
  lifecycle_action_trigger?: LifecycleActionTrigger;

  /**
   * invoke_action_trigger is populated when this action is invoked directly
   * (not via a lifecycle event). It is an empty object — its presence
   * indicates direct invocation. Exactly one of lifecycle_action_trigger and
   * invoke_action_trigger will be non-null.
   */
  invoke_action_trigger?: InvokeActionTrigger;
}

/**
 * LifecycleActionTrigger provides context for an action invocation that was
 * triggered by a resource lifecycle event (create, update, or delete).
 */
export interface LifecycleActionTrigger {
  /**
   * triggering_resource_address is the absolute address of the resource whose
   * lifecycle event triggered this action invocation.
   */
  triggering_resource_address?: string;

  /**
   * action_trigger_event is the lifecycle event that triggered this invocation,
   * e.g. "create", "update", "delete". The valid values are defined by the
   * provider's action trigger configuration.
   */
  action_trigger_event?: string;

  /**
   * action_trigger_block_index is the zero-based index of the action_trigger
   * block within the triggering resource's lifecycle configuration. A resource
   * can have multiple action_trigger blocks; this distinguishes them.
   */
  action_trigger_block_index: number;

  /**
   * actions_list_index is the zero-based index of this action within the
   * actions list of the action_trigger block. A single trigger block can
   * invoke multiple actions in sequence; this identifies which one.
   */
  actions_list_index: number;
}

/**
 * InvokeActionTrigger is a marker type indicating that an action was invoked
 * directly rather than via a lifecycle event. It has no fields — its presence
 * as a non-null value in ActionInvocation.invoke_action_trigger is the signal.
 */
export interface InvokeActionTrigger {}

/**
 * DeferredActionInvocation is an action invocation that could not be fully
 * planned in the current plan cycle. Like DeferredResourceChange, it wraps
 * the action invocation with the reason for deferral.
 * 
 * Deferred action invocations arise when the action's configuration depends on
 * values not yet known at plan time, or when a prerequisite resource was itself
 * deferred.
 * 
 * TERRAFORM ONLY — OpenTofu does not have action blocks or deferred planning.
 */
export interface DeferredActionInvocation {
  /**
   * reason is the reason why this action invocation was deferred. See the
   * DeferredReason constants for valid values. Treat unrecognized values as
   * "unknown".
   */
  reason: string;

  /**
   * action_invocation contains whatever information is available about the
   * deferred action. Treat all fields as best-effort approximations.
   */
  action_invocation: ActionInvocation;
}
