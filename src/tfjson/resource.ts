/**
 * Resource change types for Terraform/OpenTofu JSON plans.
 */

import { Change } from "./plan";

/**
 * ResourceChange describes a single planned change action for one resource
 * instance. It appears in Plan.resource_changes (what will be changed) and
 * Plan.resource_drift (what drifted from the saved state).
 * 
 * Address and related fields identify the resource instance. change describes
 * what will happen to it.
 */
export interface ResourceChange {
  /**
   * address is the absolute address of this resource instance, e.g.:
   *   "aws_instance.foo"
   *   "module.child.aws_instance.bar[0]"
   *   "module.child[\"key\"].aws_instance.baz"
   * 
   * Treat the address string as opaque for routing purposes (do not parse it
   * to extract components — use the individual type, name, index, and
   * module_address fields instead).
   */
  address?: string;

  /**
   * previous_address is the absolute address this resource instance had at the
   * end of the previous successful apply, before any move operations in the
   * current plan. It is only present when the resource was moved (via a
   * moved block) in this plan cycle. Omitted when the address has not changed.
   */
  previous_address?: string;

  /**
   * module_address is the module portion of address — everything up to but not
   * including the resource type and name. For root-module resources this is
   * omitted. Example: for "module.child.aws_instance.foo", module_address is
   * "module.child".
   */
  module_address?: string;

  /**
   * mode indicates the resource mode. Valid values:
   *   - "managed" — a managed resource
   *   - "data"    — a data source
   *   - "ephemeral" — an ephemeral resource (OpenTofu)
   */
  mode?: string;

  /**
   * type is the resource type (the first label in the resource block), e.g.
   * "aws_instance", "google_storage_bucket". Used together with provider_name
   * to unambiguously identify the resource type when a provider's resource
   * types don't follow the provider-name prefix convention.
   */
  type?: string;

  /**
   * name is the resource name label (the second label in the resource block),
   * e.g. "foo" in "resource \"aws_instance\" \"foo\" {}".
   */
  name?: string;

  /**
   * index is the instance key for resources using count or for_each. It is:
   *   - A number (integer) for count-based resources
   *   - A string for for_each-based resources
   *   - Undefined for resources with neither
   * 
   * This corresponds to the [N] or ["key"] suffix in the resource address.
   */
  index?: string | number;

  /**
   * index_unknown is true when the resource's instance key (index) cannot be
   * determined at plan time — typically because the for_each or count
   * expression depends on a value that is unknown. When index_unknown is true,
   * index will be undefined. Changes with unknown indices will typically appear
   * in deferred_changes rather than resource_changes.
   * 
   * TERRAFORM ONLY — OpenTofu does not emit this field.
   */
  index_unknown?: boolean;

  /**
   * provider_name is the source address of the provider that manages this
   * resource, e.g. "registry.terraform.io/hashicorp/aws" or
   * "registry.opentofu.org/hashicorp/aws". Note that the registry hostname
   * differs between tools — do not hardcode either hostname. Use this field
   * for equality comparisons only, not for hostname-based routing.
   */
  provider_name?: string;

  /**
   * deposed is a non-empty opaque key string when this change applies to a
   * "deposed" object — an object that was scheduled for deletion in a previous
   * plan but whose deletion was interrupted. The current (live) object has a
   * separate entry with the same address but no deposed field. Omitted for
   * changes to the current object.
   */
  deposed?: string;

  /**
   * change contains the detailed description of what will happen to this
   * resource instance: the actions to be taken, and the before/after values.
   */
  change: Change;

  /**
   * action_reason provides optional extra context for why the actions in
   * change.actions were chosen. It is a display hint for UI layers — it does
   * NOT change the semantics of the change. The set of valid values may grow
   * in future versions; always treat unrecognized values as an unspecified
   * reason.
   * 
   * See the ActionReason constants for valid values and their meanings.
   * Omitted when no additional context is available.
   */
  action_reason?: string;
}

/**
 * DeferredResourceChange is a resource change that could not be fully planned
 * in the current plan cycle. It wraps a ResourceChange with additional context
 * about why it was deferred.
 * 
 * Deferred changes arise when configuration values are not yet known at plan
 * time (e.g. an attribute that depends on the computed output of another
 * resource that hasn't been created yet). They require at least one additional
 * plan/apply cycle to resolve.
 * 
 * The resource_change inside a DeferredResourceChange may be incomplete — some
 * fields may be absent or approximate.
 * 
 * TERRAFORM ONLY — OpenTofu does not have a deferred changes mechanism. This
 * interface will never be populated when parsing OpenTofu plan output.
 */
export interface DeferredResourceChange {
  /**
   * reason is the reason why this resource change was deferred. See the
   * DeferredReason constants for valid values and their meanings. Treat
   * unrecognized values as "unknown".
   */
  reason: string;

  /**
   * resource_change contains whatever information is available about the
   * deferred change. This may be incomplete — treat all fields as best-effort
   * approximations of what the final change will look like.
   */
  resource_change: ResourceChange;
}
