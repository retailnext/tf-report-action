/**
 * Configuration types for Terraform/OpenTofu JSON plan representations.
 */

import { CtyType, JsonValue, ConfigExpressions } from "./common";
import { Expression } from "./expression";

/**
 * Config is the configuration representation embedded in Plan.configuration. It
 * describes the parsed (pre-evaluation) configuration files — the .tf source
 * as written, with expressions captured rather than resolved values.
 * 
 * This is useful for understanding the structure of the configuration and the
 * expressions that produce planned values, rather than just the planned values
 * themselves.
 */
export interface Config {
  /**
   * provider_config is a map from opaque provider configuration key to
   * provider configuration object. The key format is unspecified — treat it as
   * opaque and use it only for lookups from ConfigResource.provider_config_key.
   * 
   * When a provider is configured in a child module but used by a parent, the
   * resource's provider_config_key may not match any key in this map (the
   * provider config lives in the child module's config sub-tree).
   */
  provider_config?: { [key: string]: ProviderConfig };

  /**
   * root_module is the configuration of the root module, including all its
   * resources, outputs, variables, module calls, and nested module configs.
   */
  root_module?: ConfigModule;
}

/**
 * ProviderConfig describes a single provider configuration block.
 */
export interface ProviderConfig {
  /**
   * name is the local name of the provider as used in the configuration, e.g.
   * "aws" or "google". This is the provider's type name, without any alias.
   */
  name?: string;

  /**
   * full_name is the fully-qualified provider source address, e.g.
   * "registry.terraform.io/hashicorp/aws" or
   * "registry.opentofu.org/hashicorp/aws". The registry hostname differs
   * between tools — do not hardcode either hostname.
   */
  full_name?: string;

  /**
   * alias is the provider alias when this is a non-default provider
   * configuration (i.e. the provider block includes an alias argument).
   * Omitted for the default (un-aliased) provider configuration.
   */
  alias?: string;

  /**
   * version_constraint is the version constraint string from the required_providers
   * block or the provider block's version argument, e.g. "~> 4.0". Omitted
   * when no version constraint is specified.
   * 
   * BOTH tools emit this field (both tools' source code includes it in
   * providerConfig).
   */
  version_constraint?: string;

  /**
   * module_address is the module address of the module that contains this
   * provider configuration. Omitted for root-module provider configurations.
   */
  module_address?: string;

  /**
   * expressions is the block-expressions representation of the provider
   * configuration body. Each key is an argument name; values are either an
   * Expression object (for simple arguments) or nested block structures.
   * 
   * These are pre-evaluation: they capture what is written in the provider
   * block, not the resolved values. Use the Expression type to parse
   * individual entries, but note that nested block arguments are represented
   * as objects or arrays of objects (not plain Expressions).
   */
  expressions?: ConfigExpressions;
}

/**
 * ConfigModule represents a module's configuration — its resources, outputs,
 * variables, module calls, and (in Terraform) actions. It is used recursively:
 * Config.root_module is a ConfigModule, and each ModuleCall.module is also a
 * ConfigModule.
 */
export interface ConfigModule {
  /**
   * outputs is a map from output name to output configuration. Includes all
   * output values declared in this module.
   */
  outputs?: { [name: string]: ConfigOutput };

  /**
   * resources lists all resource blocks declared in this module (both managed
   * resources and data sources). Does not include resources in child modules
   * (those appear in the child module's ConfigModule via module_calls).
   */
  resources?: ConfigResource[];

  /**
   * module_calls is a map from module call label to module call configuration.
   * Each entry represents one module block in this module's configuration.
   * When count or for_each is used, there is still only one entry per unique
   * module call label (not one per instance).
   */
  module_calls?: { [name: string]: ModuleCall };

  /**
   * variables is a map from variable name to variable configuration,
   * describing all input variables declared in this module.
   * 
   * OPENTOFU ONLY — Terraform does not include variables in the configuration
   * representation. When parsing Terraform plan output, this map will always
   * be undefined/empty.
   */
  variables?: { [name: string]: ConfigVariable };

  /**
   * actions is a list of action blocks declared in this module. Actions are
   * provider-defined operations that can be triggered by resource lifecycle
   * events or directly invoked. This is a relatively new Terraform feature.
   * 
   * TERRAFORM ONLY — OpenTofu does not have action blocks.
   */
  actions?: ConfigAction[];
}

/**
 * ModuleCall represents a single module block in a parent module's
 * configuration.
 */
export interface ModuleCall {
  /**
   * source is the source address of the child module as written in the
   * module block, e.g. "./modules/vpc" or "hashicorp/consul/aws".
   * 
   * OPENTOFU uses this field name. For maximum compatibility, check both
   * source and resolved_source; use whichever is non-empty.
   */
  source?: string;

  /**
   * resolved_source is the fully-resolved source address of the child module,
   * after registry lookups and version resolution have been performed.
   * 
   * TERRAFORM uses this field name. For maximum compatibility, check both
   * source and resolved_source; use whichever is non-empty.
   * 
   * Note: both tools' source has a "source" field, but Terraform renamed it
   * to "resolved_source" to clarify that it is post-resolution.
   */
  resolved_source?: string;

  /**
   * expressions is the block-expressions representation of the module call's
   * input variable arguments. Each key is a variable name; values are
   * Expression objects.
   */
  expressions?: ConfigExpressions;

  /**
   * count_expression is the expression for the count meta-argument, if present.
   * Undefined when count is not used.
   */
  count_expression?: Expression;

  /**
   * for_each_expression is the expression for the for_each meta-argument, if
   * present. Undefined when for_each is not used.
   */
  for_each_expression?: Expression;

  /**
   * module is the recursive configuration of the child module. This is
   * undefined when the module's configuration is not available (e.g. if the
   * module source could not be resolved).
   * 
   * Note: In OpenTofu source, this field is a pointer (*module); in Terraform
   * source, it is an embedded value (module). The unified TypeScript interface
   * uses optional (?) for both.
   */
  module?: ConfigModule;

  /**
   * version_constraint is the version constraint for registry modules, e.g.
   * "~> 3.0". Omitted for local path modules and when no version constraint
   * is specified.
   * 
   * OPENTOFU ONLY — Terraform does not emit this field in the configuration
   * representation.
   */
  version_constraint?: string;

  /**
   * depends_on is the list of dependency addresses from the module block's
   * depends_on meta-argument.
   * 
   * OPENTOFU ONLY — Terraform does not emit this field in the configuration
   * representation.
   */
  depends_on?: string[];
}

/**
 * ConfigResource represents a single resource block (managed resource or data
 * source) in the configuration.
 */
export interface ConfigResource {
  /**
   * address is the absolute address of this resource (without any instance
   * keys, since this is configuration not instances), e.g.
   * "aws_instance.foo" or "module.child.aws_instance.bar".
   */
  address?: string;

  /**
   * mode indicates whether this is a managed resource ("managed") or data
   * source ("data").
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
   * provider_config_key is an opaque key into the Config.provider_config map
   * identifying which provider configuration this resource uses. Note: when
   * the provider is configured in a parent module (not the module where this
   * resource is defined), this key may not appear in the module-local
   * provider_config — it will be in a parent module's provider_config map.
   */
  provider_config_key?: string;

  /**
   * provisioners lists the provisioner blocks within this resource, if any.
   * Connection information is excluded. Omitted when no provisioners are
   * defined.
   */
  provisioners?: Provisioner[];

  /**
   * expressions is the block-expressions representation of the resource
   * configuration body. Each key is an argument name; values are either an
   * Expression object (for simple scalar arguments) or nested objects/arrays
   * for block arguments.
   * 
   * Note: expressions inside dynamic blocks are NOT included here.
   */
  expressions?: ConfigExpressions;

  /**
   * schema_version is the version of the resource type schema that the
   * expressions object conforms to.
   * 
   * In OpenTofu, this may be undefined (omitted when zero or unconstrained).
   * In Terraform, it is always present as a number.
   */
  schema_version?: number;

  /**
   * count_expression is the expression for the count meta-argument, if present.
   * Undefined when count is not used on this resource.
   */
  count_expression?: Expression;

  /**
   * for_each_expression is the expression for the for_each meta-argument, if
   * present. Undefined when for_each is not used on this resource.
   */
  for_each_expression?: Expression;

  /**
   * depends_on is the list of addresses from the resource block's depends_on
   * meta-argument. These are the explicit dependencies declared by the module
   * author.
   * 
   * OPENTOFU ONLY — Terraform does not emit this field in the configuration
   * representation.
   */
  depends_on?: string[];
}

/**
 * ConfigOutput represents a single output block in a module's configuration.
 */
export interface ConfigOutput {
  /**
   * sensitive indicates whether this output was declared with
   * sensitive = true. When true, the output's value is redacted in all UI
   * output and in the plan JSON values representation.
   */
  sensitive?: boolean;

  /**
   * ephemeral indicates whether this output was declared as ephemeral. An
   * ephemeral output's value exists only during the plan/apply cycle and is
   * not persisted to state.
   * 
   * OPENTOFU ONLY — Terraform does not have ephemeral output support.
   */
  ephemeral?: boolean;

  /**
   * deprecated is a deprecation message for this output, set when the module
   * author has marked the output as deprecated. This message should be
   * surfaced to callers of the module as a warning.
   * 
   * OPENTOFU ONLY — Terraform does not support output deprecation.
   */
  deprecated?: string;

  /**
   * expression is the configuration expression that produces this output's
   * value. This is a pre-evaluation snapshot; it captures what is written in
   * the output block, not the resolved value.
   * 
   * Note: In OpenTofu source this field may be undefined for outputs with no
   * value expression; in Terraform it is always present. The TypeScript
   * interface uses optional (?) for safety.
   */
  expression?: Expression;

  /**
   * depends_on is the list of addresses from the output block's depends_on
   * meta-argument.
   * 
   * OPENTOFU ONLY — Terraform does not emit this field.
   */
  depends_on?: string[];

  /**
   * description is the author-provided description string for this output.
   * 
   * OPENTOFU ONLY — Terraform does not emit this field in the configuration
   * representation.
   */
  description?: string;
}

/**
 * ConfigVariable represents a single variable block in a module's configuration.
 * 
 * OPENTOFU ONLY — Terraform does not include variables in the configuration
 * representation (Plan.configuration). When parsing Terraform plan output, the
 * ConfigModule.variables map will always be undefined/empty.
 */
export interface ConfigVariable {
  /**
   * type is the type constraint for this variable, using the cty type
   * descriptor format: "string", "number", "bool", ["list","string"],
   * ["object",{"attr":"type"}], etc. Undefined when no type constraint is
   * specified (the variable accepts any type).
   */
  type?: CtyType;

  /**
   * default is the JSON-encoded default value for this variable. Undefined
   * when no default is specified (i.e. the variable is required).
   */
  default?: JsonValue;

  /**
   * description is the author-provided description of what this variable is
   * for and what values it accepts.
   */
  description?: string;

  /**
   * required is true when this variable must be provided by a caller (no
   * default value). Undefined (false) for optional variables. This is derived
   * from the absence of a default value.
   */
  required?: boolean;

  /**
   * sensitive indicates whether this variable was declared with
   * sensitive = true. Values of sensitive variables are redacted in logs and
   * UI output.
   */
  sensitive?: boolean;

  /**
   * ephemeral indicates whether this variable was declared as ephemeral. An
   * ephemeral variable's value exists only during the plan/apply cycle and is
   * not persisted.
   */
  ephemeral?: boolean;

  /**
   * deprecated is a deprecation message for this variable. Callers providing
   * a value for a deprecated variable should see this message as a warning.
   */
  deprecated?: string;
}

/**
 * ConfigAction represents a single action block in a module's configuration.
 * Actions are provider-defined operations (e.g. sending an email, triggering a
 * deployment) that can be invoked directly or triggered by resource lifecycle
 * events (create, update, delete). They are separate from resource lifecycle
 * and do not manage state.
 * 
 * TERRAFORM ONLY — OpenTofu does not have action blocks.
 */
export interface ConfigAction {
  /**
   * address is the absolute address of this action, e.g.
   * "module.child.aws_sesv2_send_email.notify".
   */
  address?: string;

  /**
   * type is the action type (the first label in the action block), defined by
   * the provider.
   */
  type?: string;

  /**
   * name is the action name label (the second label in the action block).
   */
  name?: string;

  /**
   * provider_config_key is an opaque key into Config.provider_config identifying
   * which provider configuration manages this action.
   */
  provider_config_key?: string;

  /**
   * count_expression is the expression for the count meta-argument, if present.
   */
  count_expression?: Expression;

  /**
   * for_each_expression is the expression for the for_each meta-argument, if
   * present.
   */
  for_each_expression?: Expression;
}

/**
 * Provisioner represents a single provisioner block within a resource
 * configuration. Connection block information is excluded from this
 * representation for security reasons.
 */
export interface Provisioner {
  /**
   * type is the provisioner type, e.g. "remote-exec", "local-exec", "file".
   */
  type?: string;

  /**
   * expressions is the block-expressions representation of this provisioner's
   * configuration body. Each key is an argument name; values are Expression
   * objects or nested block structures.
   */
  expressions?: ConfigExpressions;
}
