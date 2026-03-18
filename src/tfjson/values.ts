/**
 * State values types for Terraform/OpenTofu JSON representations.
 */

import { JsonValue, AttributeValues, AttributeShadow, CtyType } from "./common";

/**
 * StateValues is the top-level structure of a values representation. It is
 * used in Plan.planned_values (the expected state after apply) and inside
 * State.values (the current state before this plan).
 *
 * The structure is the same in both contexts, but the completeness differs:
 *   - In planned_values: unknown values are omitted; this is what the world will
 *     look like after apply, with gaps for anything not yet determined.
 *   - In State.values (prior state): all values are known and fully populated.
 */
export interface StateValues {
  /**
   * outputs is a map from output name to output value, for all outputs defined
   * in the root module that have a known value. Child module outputs are not
   * directly accessible here (they appear only through resource attribute
   * references).
   */
  outputs?: { [name: string]: ValuesOutput };

  /**
   * root_module contains the resources and child modules at the root level of
   * the configuration. Nested modules appear recursively via child_modules.
   */
  root_module?: ValuesModule;
}

/**
 * ValuesOutput represents a single output value in the values representation.
 */
export interface ValuesOutput {
  /**
   * sensitive indicates whether this output has been declared sensitive. When
   * true, the actual value is replaced with null to prevent accidental
   * disclosure in logs or UI output.
   */
  sensitive: boolean;

  /**
   * deprecated is a deprecation message for this output, set when the module
   * author has marked the output as deprecated. Consumers should surface this
   * as a warning to callers of the module.
   *
   * OPENTOFU ONLY — Terraform does not support output deprecation.
   */
  deprecated?: string;

  /**
   * value is the JSON-encoded value of this output. Null when the output is
   * sensitive (sensitive == true) or when the value is unknown at plan time.
   */
  value?: JsonValue | null;

  /**
   * type is the JSON-encoded cty type descriptor for this output's value.
   * Primitive types are strings: "string", "number", "bool". Collection and
   * structural types are arrays: ["list","string"], ["map","number"],
   * ["set","string"], ["object",{"attr":"type",...}], ["tuple",[...]].
   *
   * Note: lists, sets, and tuples all serialize to JSON arrays; maps and
   * objects both serialize to JSON objects. The type descriptor is needed to
   * disambiguate.
   */
  type?: CtyType;
}

/**
 * ValuesModule represents a module instance in the values tree. It is used
 * recursively: root_module is a ValuesModule, and each entry in child_modules
 * is also a ValuesModule.
 */
export interface ValuesModule {
  /**
   * resources lists all resource instances in this module that have a
   * non-delete action (or no-op). Resources being deleted may be omitted.
   */
  resources?: ValueResource[];

  /**
   * address is the module instance address for this module (e.g.
   * "module.child" or "module.parent.module.child[0]"). Omitted for the root
   * module (empty string).
   */
  address?: string;

  /**
   * child_modules contains the nested module instances called from this module,
   * one entry per module instance (count/for_each create multiple entries with
   * different address values).
   */
  child_modules?: ValuesModule[];
}

/**
 * ValueResource represents a single resource instance in the values
 * representation. This interface is used in both planned_values (what the resource
 * will look like after apply) and prior_state.values (what it currently looks
 * like), so some fields are only populated in one context.
 */
export interface ValueResource {
  /**
   * address is the absolute address of this resource instance, e.g.
   * "aws_instance.foo" or "module.child.aws_instance.bar[0]". Treat as opaque.
   */
  address?: string;

  /**
   * mode indicates the resource mode. Valid values: "managed", "data",
   * "ephemeral".
   */
  mode?: string;

  /**
   * type is the resource type (e.g. "aws_instance").
   */
  type?: string;

  /**
   * name is the resource name label.
   */
  name?: string;

  /**
   * index is the instance key for resources using count or for_each:
   *   - A number for count-based resources
   *   - A string for for_each-based resources
   *   - Undefined for single-instance resources
   */
  index?: string | number;

  /**
   * provider_name is the fully-qualified provider source address. The registry
   * hostname differs between tools (registry.terraform.io vs
   * registry.opentofu.org); do not hardcode either. Use for equality
   * comparisons only.
   *
   * Note: in state representations, the JSON tag is "provider_name" with no
   * omitempty — it is always present even if empty.
   */
  provider_name: string;

  /**
   * schema_version is the version of the resource type schema that the values
   * object conforms to. This number is defined by the provider. Consumers
   * typically don't need to use this unless they are performing their own
   * schema-aware parsing of values.
   */
  schema_version: number;

  /**
   * values contains the attribute values of this resource instance. The
   * structure depends on the resource type's schema. Unknown values (in
   * planned_values) are omitted or null; sensitive values are also null.
   * Consult Change.after_unknown and Change.after_sensitive to identify which
   * null/absent fields are unknown or sensitive.
   */
  values?: AttributeValues;

  /**
   * sensitive_values mirrors the structure of values but contains only
   * sensitive leaf attributes, each set to true. Non-sensitive leaves are
   * omitted. Use this alongside values to identify which attributes should not
   * be displayed to users.
   */
  sensitive_values?: AttributeShadow;

  /**
   * depends_on is the list of addresses of other resources or modules that this
   * resource depends on (from the depends_on meta-argument). These are
   * relative to the containing module.
   *
   * Present in planned_values resources (OPENTOFU ONLY) and in prior_state
   * resources (BOTH tools, via jsonstate).
   */
  depends_on?: string[];

  /**
   * tainted is true when this resource instance is marked as tainted in the
   * state — i.e. it is scheduled for replacement on the next apply because a
   * previous apply partially succeeded. Tainted resources appear in
   * resource_changes with action_reason "replace_because_tainted".
   *
   * Present in prior_state resources only (BOTH tools, via jsonstate).
   * Not present in planned_values resources.
   */
  tainted?: boolean;

  /**
   * deposed_key is the opaque deposed object key when this resource entry
   * represents a deposed object (one that was scheduled for deletion in a
   * previous plan cycle but whose deletion was interrupted). When set, this
   * is NOT the current live resource; the current object has a separate entry
   * with the same address but no deposed_key.
   *
   * Present in prior_state resources only (BOTH tools, via jsonstate).
   */
  deposed_key?: string;

  /**
   * identity_schema_version is the version of the resource identity schema that
   * the identity_values object conforms to. This is optional (undefined) because
   * zero (0) is a valid schema version but the field should be absent when no
   * identity schema exists.
   *
   * TERRAFORM ONLY — OpenTofu does not have a resource identity concept.
   */
  identity_schema_version?: number;

  /**
   * identity_values contains the resource's identity attribute values. Resource
   * identity is a provider-defined set of attributes that uniquely identify
   * the resource in the provider's API. This is distinct from and
   * complementary to the resource's configuration attributes in values.
   *
   * TERRAFORM ONLY — OpenTofu does not have a resource identity concept.
   */
  identity?: AttributeValues;
}
