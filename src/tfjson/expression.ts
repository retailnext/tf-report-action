/**
 * Expression types for Terraform/OpenTofu configuration representations.
 */

import { JsonValue } from "./common";

/**
 * Expression represents a single unevaluated configuration expression as it
 * appears in the "configuration" section of a plan. Expressions are
 * pre-evaluation snapshots: they capture what is written in .tf files, not the
 * resolved runtime values (those appear in planned_values instead).
 *
 * Exactly one of constantValue or references will be set for any given
 * expression. When neither is set, the expression is absent or the zero value
 * (e.g. an omitted optional argument).
 *
 * The expression representation is identical in both OpenTofu and Terraform.
 *
 * Note: expressions inside dynamic blocks are NOT included in the configuration
 * representation — Terraform explicitly documents this, and OpenTofu behaves
 * the same way.
 */
export interface Expression {
  /**
   * constantValue is set when the expression contains no references to other
   * objects — i.e. it is a pure literal. The value is the JSON-encoded result
   * of evaluating the expression. This will be null (JSON null) if the
   * expression evaluates to null.
   *
   * constantValue and references are mutually exclusive. If constantValue is
   * non-undefined, references will be undefined/empty.
   */
  constant_value?: JsonValue;

  /**
   * references is the list of identifiers that the expression depends on.
   * It is set when the expression contains at least one reference to another
   * object (variable, resource, module output, etc.).
   *
   * Multi-step references are "unwrapped" into all their prefix steps. For
   * example, a reference to "data.template_file.foo[1].vars[\"baz\"]" will
   * produce entries for:
   *   - "data.template_file.foo[1].vars[\"baz\"]"
   *   - "data.template_file.foo[1].vars"
   *   - "data.template_file.foo[1]"
   *   - "data.template_file.foo"
   *   - "data.template_file"
   *
   * This expansion lets consumers check whether an expression references a
   * particular object at any granularity using simple string equality, without
   * needing to parse expression syntax themselves. Consumers should use only
   * string equality checks here — the syntax of reference strings may be
   * extended in future releases.
   *
   * constantValue and references are mutually exclusive. If references is
   * non-empty, constantValue will be undefined.
   */
  references?: string[];
}
