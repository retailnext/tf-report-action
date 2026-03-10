/**
 * Plan types for Terraform/OpenTofu JSON plan output.
 */

import { JsonValue, AttributeValues, AttributeShadow, ChangeActions } from "./common";
// Expression type is available from expression.ts but not used in this file
import { CheckResult } from "./checks";
import { ResourceChange, DeferredResourceChange } from "./resource";
import { StateValues } from "./values";
import { State } from "./state";
import { Config } from "./config";
import { ActionInvocation, DeferredActionInvocation } from "./action_invocations";

/**
 * Plan is the top-level JSON plan output produced by:
 *   - OpenTofu:   tofu show -json <planfile>
 *   - Terraform:  terraform show -json <planfile>
 * 
 * Both tools emit format_version "1.2" in their current source (note: official
 * documentation still shows "1.0" — consumers should check only the major
 * version for compatibility). The structures are nearly identical; fields
 * emitted by only one tool are documented as OPENTOFU ONLY or TERRAFORM ONLY.
 * 
 * To determine which tool generated a plan, look for tool-specific fields:
 *   - timestamp present → likely OpenTofu
 *   - applyable present (non-zero) → likely Terraform
 *   - terraform_version will contain the actual version string of whichever tool
 *     generated the plan (OpenTofu keeps the "terraform_version" key for
 *     compatibility but the value will be an OpenTofu version string).
 */
export interface Plan {
  /**
   * format_version is the version of the JSON plan format. Currently "1.2" in
   * both tools' source, though official documentation shows "1.0". A minor
   * version bump (e.g. 1.1 → 1.2) indicates backward-compatible additions;
   * a major version bump indicates a breaking change. Consumers should check
   * only the major version component for compatibility.
   */
  format_version: string;

  /**
   * terraform_version is the version of the tool that generated this plan.
   * OpenTofu retains this key name for compatibility with downstream consumers,
   * but when OpenTofu generates the plan the value will be an OpenTofu version
   * string (e.g. "1.7.0"), not a Terraform version string.
   */
  terraform_version?: string;

  /**
   * variables contains the input variable values that were provided for this
   * plan run (after defaults have been applied). The map key is the variable
   * name. Variables that were not provided and have no default will not appear
   * here; only variables whose values contributed to the plan are included.
   */
  variables?: { [name: string]: PlanVariable };

  /**
   * planned_values describes the complete set of expected values after the plan
   * is applied. This is the "what will the world look like" view. Attribute
   * values that are not yet known (will only be determined after apply) are
   * omitted from this representation — see resource_changes[*].change.after_unknown
   * to determine which values are unknown.
   */
  planned_values?: StateValues;

  /**
   * resource_drift contains changes detected between the prior state saved on
   * disk and the actual real-world state at the time of planning (i.e., drift
   * detected during a refresh). In refresh-only mode all drifted resources are
   * included; in other modes only resources with actual changes (not just
   * move-only changes) appear here. Uses the same ResourceChange structure as
   * resource_changes.
   */
  resource_drift?: ResourceChange[];

  /**
   * resource_changes lists every resource instance change that will be made
   * when this plan is applied. Each entry describes one resource instance
   * (identified by address) and the action(s) that will be taken. Entries are
   * sorted in a consistent but unspecified user-friendly order.
   * 
   * This is the primary field for understanding what a plan will do.
   */
  resource_changes?: ResourceChange[];

  /**
   * deferred_changes lists resource changes that cannot be fully planned in
   * this plan cycle. Each deferred change includes the reason it was deferred
   * and whatever partial information is available.
   * 
   * Deferred changes arise when configuration values are unknown at plan time
   * (e.g. an attribute depends on an as-yet-unknown computed value from another
   * resource). A subsequent plan/apply cycle will resolve them.
   * 
   * TERRAFORM ONLY — OpenTofu does not have a deferred changes mechanism.
   */
  deferred_changes?: DeferredResourceChange[];

  /**
   * deferred_action_invocations lists action invocations that cannot be fully
   * planned in this cycle, for the same reasons as deferred_changes.
   * 
   * TERRAFORM ONLY.
   */
  deferred_action_invocations?: DeferredActionInvocation[];

  /**
   * output_changes describes the planned changes to root module output values,
   * keyed by output name. Each value is a Change using the same structure as
   * resource changes, where before and after represent the output's value
   * before and after the plan is applied.
   */
  output_changes?: { [name: string]: Change };

  /**
   * action_invocations lists the action invocations (calls to provider-defined
   * actions) that will occur when this plan is applied. This is a Terraform
   * feature for lifecycle actions that trigger external side-effects.
   * 
   * TERRAFORM ONLY.
   */
  action_invocations?: ActionInvocation[];

  /**
   * prior_state is the state as it was recorded at the start of planning —
   * the "before" snapshot of the world from the last successful apply. This
   * may differ from the actual current real-world state (see resource_drift).
   * 
   * This object uses the state JSON format (format_version "1.0") and has the
   * same structure as `terraform show -json` of a state file.
   */
  prior_state?: State;

  /**
   * configuration is the parsed configuration that was used to produce this plan.
   * It represents the .tf files as written (pre-evaluation), capturing
   * expressions rather than resolved values.
   */
  configuration?: Config;

  /**
   * relevant_attributes identifies the specific resource attributes that
   * contributed to the planned changes. This can be used by UIs to highlight
   * which attributes caused a change to be planned.
   */
  relevant_attributes?: ResourceAttr[];

  /**
   * checks contains the partial evaluation results of all checkable objects
   * (resources with precondition/postcondition blocks, check blocks, and input
   * variable validations). Many checks will be "unknown" at plan time;
   * definitive results are only available after apply.
   * 
   * See the CheckResult type for full documentation of this structure.
   * 
   * Stability: In Terraform this is marked EXPERIMENTAL (may change in minor
   * releases). In OpenTofu it is considered stable.
   */
  checks?: CheckResult[];

  /**
   * timestamp is the UTC time at which this plan was generated, in ISO 8601
   * format (e.g. "2023-08-25T00:00:00Z").
   * 
   * OPENTOFU ONLY — Terraform does not include a timestamp in plan output.
   */
  timestamp?: string;

  /**
   * applyable indicates whether automation should attempt to apply this plan.
   * This is Terraform's primary signal for automation pipelines: a plan is
   * applyable when it is error-free and has at least one change to make.
   * Use this field rather than inspecting resource_changes for automation
   * decisions, as its semantics are deliberately stable even if the underlying
   * definition evolves.
   * 
   * TERRAFORM ONLY — OpenTofu does not emit this field. When parsing an
   * OpenTofu plan, this field will be undefined; derive equivalent logic from
   * errored and whether resource_changes/output_changes are non-empty.
   */
  applyable?: boolean;

  /**
   * complete indicates whether applying this plan will fully converge the
   * state to match the configuration. When false, there are deferred changes
   * that require at least one additional plan/apply cycle to resolve.
   * 
   * TERRAFORM ONLY — OpenTofu does not emit this field (OpenTofu does not have
   * a deferred changes mechanism).
   */
  complete?: boolean;

  /**
   * errored is true if the planning process itself encountered an error (e.g.
   * a provider returned an error, or a precondition check failed during
   * planning). An errored plan should not be applied.
   * 
   * When errored is true, the plan may be incomplete: some resource changes
   * may be missing or partially populated. The plan should be treated as
   * informational only.
   * 
   * BOTH tools.
   */
  errored: boolean;
}

/**
 * PlanVariable holds the resolved value of a single input variable in the plan.
 */
export interface PlanVariable {
  /**
   * value is the JSON-encoded resolved value of this variable, after applying
   * any default values. The structure depends on the variable's type
   * constraint (e.g. a string variable has a JSON string, an object variable
   * has a JSON object).
   */
  value?: JsonValue;

  /**
   * deprecated is a human-readable message indicating that this variable has
   * been marked as deprecated by the module author. Consumers should surface
   * this message as a warning when the variable is provided by a caller.
   * Absent (undefined) for non-deprecated variables.
   * 
   * OPENTOFU ONLY — Terraform does not support variable deprecation.
   */
  deprecated?: string;
}

/**
 * ResourceAttr identifies a specific attribute of a resource instance. It is
 * used in Plan.relevant_attributes to indicate which attributes contributed to
 * the planned changes.
 */
export interface ResourceAttr {
  /**
   * resource is the absolute address of the resource instance whose attribute
   * contributed to a planned change (e.g. "aws_instance.foo" or
   * "module.child.aws_instance.bar[0]"). Treat this as an opaque string.
   */
  resource: string;

  /**
   * attribute is a JSON-encoded path expression identifying the specific attribute
   * within the resource. The path is an array of steps, where each step is
   * either a string (attribute name or map key) or a number (array index).
   * Example: ["tags", "Name"] refers to resource.tags["Name"].
   */
  attribute: (string | number)[];
}

/**
 * Change describes the planned change for a single resource instance or output
 * value. It is used in both ResourceChange.change and Plan.output_changes values.
 */
export interface Change {
  /**
   * actions describes what will be done to the target object as an array of
   * action strings. See the ChangeActions type for the complete set of valid
   * combinations.
   * 
   * The multi-step replace combinations allow consumers to detect all deletion
   * scenarios by scanning for "delete" in the actions array — this covers both
   * plain deletion and all replace orderings. New combinations may be added in
   * future versions; consumers should be resilient to unknown combinations and
   * should NOT assume actions has exactly one element.
   * 
   * For ["no-op"], before and after contain identical values.
   * For ["create"], before is null/undefined.
   * For ["delete"] and ["forget"] (OpenTofu), after is null/undefined.
   */
  actions: ChangeActions;

  /**
   * before is the JSON-encoded value of the object before the action is
   * applied. For ["create"] actions, before is null. For ["no-op"] actions,
   * before and after are identical.
   * 
   * The structure mirrors the resource's attribute schema. Sensitive attribute
   * values are replaced with null — use before_sensitive to identify which
   * attributes are sensitive. Unknown values are not possible in before (the
   * prior state is always fully known).
   */
  before?: AttributeValues | null;

  /**
   * after is the JSON-encoded value of the object after the action is applied.
   * For ["delete"] and ["forget"] (OpenTofu) actions, after is null.
   * 
   * after may be incomplete: attribute values that will only be known after
   * apply are omitted (null) here. Use after_unknown to determine which values
   * are unknown vs. intentionally null. Use after_sensitive to identify which
   * attributes are sensitive.
   */
  after?: AttributeValues | null;

  /**
   * after_unknown is an object with the same structure as after, but where:
   *   - true indicates the corresponding leaf value will only be known after apply
   *   - the key is omitted entirely for values that ARE known
   * 
   * Combining after and after_unknown gives the complete picture of the planned
   * post-apply state: keys present in after with known values, keys present in
   * after_unknown with value true for unknowns, and everything else omitted.
   * 
   * For ["delete"] actions where after is null, after_unknown may still be
   * present to indicate that certain destroy-time behaviors are unknown.
   */
  after_unknown?: AttributeShadow;

  /**
   * before_sensitive is an object with the same structure as before, but where:
   *   - true indicates the corresponding leaf value is sensitive (e.g. a password)
   *   - the key is omitted for non-sensitive values
   * 
   * The actual sensitive values are replaced with null in before. Use
   * before_sensitive to identify which null/absent values in before are
   * sensitive (as opposed to actually null). This enables UIs to display
   * "(sensitive value)" rather than "(null)" for sensitive attributes.
   * 
   * An attribute can be both sensitive AND unknown — in that case it will be
   * marked true in after_sensitive even though its value is not yet known.
   * Check both dimensions independently.
   */
  before_sensitive?: AttributeShadow;

  /**
   * after_sensitive is an object with the same structure as after, but where:
   *   - true indicates the corresponding leaf value is sensitive
   *   - the key is omitted for non-sensitive values
   * 
   * See before_sensitive for full explanation of how to use this field.
   * An attribute can be both sensitive AND unknown simultaneously.
   */
  after_sensitive?: AttributeShadow;

  /**
   * replace_paths is an array of path arrays identifying which specific
   * attribute paths caused a replace action to be chosen. Each inner array is
   * a path consisting of string (attribute name / map key) and number (array
   * index) steps.
   * 
   * Omitted when:
   *   - The action is not a replace (["delete","create"] or ["create","delete"])
   *   - The replacement was caused by something not attributable to a specific
   *     path (e.g. the resource was tainted, or the user explicitly requested
   *     replacement with -replace)
   * 
   * When present, each path points to the attribute whose required change
   * forced the replacement. A UI can use this to highlight specifically which
   * attribute triggered a destructive replacement.
   */
  replace_paths?: (string | number)[][];

  /**
   * importing is present (non-null) when this change is an import operation —
   * i.e. an existing real-world resource is being brought under management.
   * Import can occur alongside other actions: a resource might be imported AND
   * updated in the same operation.
   * 
   * The presence of importing does not replace the actions field — the actions
   * field still describes what change (if any) will be made to the resource
   * after import.
   * 
   * Per both tools' source code: the contents of this object are subject to
   * change; downstream consumers should treat all fields within it as strictly
   * optional.
   */
  importing?: Importing;

  /**
   * generated_config contains HCL configuration that was auto-generated for
   * this resource during an import operation where no existing resource
   * configuration block was present. The generated config is a string
   * containing valid HCL that the user can copy into their .tf files.
   * 
   * When generated_config is set, importing will also typically be set, but
   * this pairing may change in future versions. Not all import operations
   * produce generated config — only those where the user ran import without
   * a pre-existing resource block.
   * 
   * OPENTOFU ONLY — Terraform does not emit generated_config in plan output
   * (as of the analyzed commit; this may change).
   */
  generated_config?: string;

  /**
   * before_identity is the JSON-encoded identity value of the resource before
   * the action. Resource identity is a provider-defined set of attributes that
   * uniquely identify the resource in the provider's API (distinct from the
   * resource's configuration attributes). Omitted for resources without a
   * defined identity schema, or for create actions where there is no prior
   * resource.
   * 
   * TERRAFORM ONLY — OpenTofu does not have a resource identity concept.
   */
  before_identity?: AttributeValues | null;

  /**
   * after_identity is the JSON-encoded identity value of the resource after the
   * action. Omitted for delete/forget actions where the resource will no longer
   * exist, and for resources without a defined identity schema.
   * 
   * TERRAFORM ONLY — OpenTofu does not have a resource identity concept.
   */
  after_identity?: AttributeValues | null;
}

/**
 * Importing contains metadata about an import operation embedded in a Change.
 * Its presence (non-null) indicates the Change is an import operation. The
 * actual contents are subject to change; treat all fields as optional.
 */
export interface Importing {
  /**
   * id is the import identifier string used to locate the existing real-world
   * resource in the provider's API. This is the value that was provided in the
   * import block's id argument (or the -id flag when using CLI import).
   * May be empty if identity-based import is used instead.
   */
  id?: string;

  /**
   * unknown indicates the import ID was not yet known at plan time. When true,
   * the overall resource change will be deferred (it will appear in
   * deferred_changes rather than resource_changes). This field is only
   * meaningful in the context of deferred changes.
   * 
   * TERRAFORM ONLY.
   */
  unknown?: boolean;

  /**
   * identity is the JSON-encoded resource identity used for identity-based
   * import. This is an alternative to id for providers that support importing
   * by structured identity attributes rather than a single string ID.
   * 
   * TERRAFORM ONLY.
   */
  identity?: AttributeValues;
}
