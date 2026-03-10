/**
 * Common type definitions shared across the tfjson package.
 * 
 * These types handle the JSON representation of Terraform/OpenTofu plans,
 * providing precise TypeScript types that eliminate the need for `any`.
 */

/**
 * JsonValue represents any valid JSON value. This is a discriminated union
 * covering all JSON types: null, boolean, number, string, array, object.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonArray
  | JsonObject;

export interface JsonArray extends Array<JsonValue> {}

export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * CtyType represents a Terraform/OpenTofu type descriptor. The cty library
 * (used by both tools) encodes types as either:
 *   - A string for primitive types: "string", "number", "bool", "dynamic"
 *   - A 2-element array for parameterized types: ["list", <elementType>]
 *   - A 2-element array with object for object types: ["object", {attr: type, ...}]
 *   - A 2-element array with array for tuple types: ["tuple", [type, type, ...]]
 * 
 * This recursive definition captures all possible cty type descriptors.
 */
export type CtyPrimitive = "string" | "number" | "bool" | "dynamic";

export type CtyType =
  | CtyPrimitive
  | ["list", CtyType]
  | ["map", CtyType]
  | ["set", CtyType]
  | ["object", { [key: string]: CtyType }]
  | ["tuple", CtyType[]];

/**
 * AttributeValues represents the JSON-encoded attribute values of a resource
 * or other configuration object. Each key is an attribute name; values are
 * arbitrary JSON values whose structure depends on the resource type's schema.
 * 
 * Unknown values (attributes not yet determined at plan time) are represented
 * as null or omitted. Sensitive values are also represented as null. Consult
 * AttributeShadow fields (after_unknown, before_sensitive, after_sensitive)
 * to distinguish between null, unknown, and sensitive values.
 */
export interface AttributeValues {
  [key: string]: JsonValue;
}

/**
 * AttributeShadow represents the "shadow" structure used for after_unknown,
 * before_sensitive, and after_sensitive fields. It mirrors the structure of
 * the corresponding AttributeValues object, but:
 *   - Leaf values are `true` when the attribute is unknown/sensitive
 *   - Leaf values are `false` or omitted when the attribute is known/non-sensitive
 *   - Container types (objects, arrays) recurse with the same pattern
 * 
 * This type is based on the `unknownAsBool()` and `SensitiveAsBool()` functions
 * in both tools' source code, which produce this structure.
 * 
 * Examples:
 *   - `true` — a primitive leaf value is unknown/sensitive
 *   - `{ "name": true, "tags": { "env": true } }` — nested object with some unknown/sensitive leaves
 *   - `[true, false, true]` — array where elements 0 and 2 are unknown/sensitive
 */
export type AttributeShadow =
  | boolean
  | AttributeShadowMap
  | AttributeShadow[];

export interface AttributeShadowMap {
  [key: string]: AttributeShadow;
}

/**
 * ChangeActions represents the exact set of valid action combinations that
 * can appear in a Change's actions field. This is a discriminated union of
 * tuples, ensuring type safety for consumers checking what action will occur.
 * 
 * Valid combinations:
 *   - ["no-op"] — no change
 *   - ["create"] — create new resource
 *   - ["read"] — read data source during apply
 *   - ["update"] — in-place update
 *   - ["delete"] — destroy resource
 *   - ["forget"] — remove from state without destroying (OpenTofu)
 *   - ["delete", "create"] — replace: destroy then create
 *   - ["create", "delete"] — replace: create then destroy (create_before_destroy)
 *   - ["create", "forget"] — replace: create new, forget old (Terraform)
 */
export type ChangeActions =
  | ["no-op"]
  | ["create"]
  | ["read"]
  | ["update"]
  | ["delete"]
  | ["forget"]
  | ["delete", "create"]
  | ["create", "delete"]
  | ["create", "forget"];

/**
 * ConfigExpression represents a single expression or nested block structure
 * in configuration representations. Config expressions can be:
 *   - An Expression object (constant_value or references)
 *   - A nested block object (for block arguments) containing more expressions
 *   - An array of nested block objects (for repeatable block arguments)
 * 
 * This recursive definition handles the arbitrary nesting depth of HCL blocks.
 */
export type ConfigExpression =
  | { constant_value?: JsonValue; references?: string[] }  // Expression
  | ConfigExpressionBlock
  | ConfigExpressionBlock[];

export interface ConfigExpressionBlock {
  [key: string]: ConfigExpression;
}

/**
 * ConfigExpressions is the type for the `expressions` field in provider
 * configurations, resources, and other config objects. It maps argument names
 * to their expression representations.
 */
export interface ConfigExpressions {
  [key: string]: ConfigExpression;
}
