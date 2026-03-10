/**
 * Check result types for Terraform/OpenTofu condition evaluation.
 */

import { CheckStatus } from "./constants";

/**
 * CheckResult is a single entry in the top-level "checks" array of a plan or
 * state. Each entry represents one "checkable object" — a resource with
 * precondition/postcondition blocks, a standalone check block, or an input
 * variable with a validation block.
 * 
 * The checks array is populated at plan time with whatever information is
 * available; many checks will be in "unknown" status until apply time when all
 * values are resolved.
 * 
 * Stability note:
 *   - In Terraform, the checks schema is marked EXPERIMENTAL. Details may change
 *     in future versions, even minor releases. Build defensively.
 *   - In OpenTofu, the checks schema is considered stable.
 * 
 * BOTH tools emit checks in plans and state. OpenTofu also embeds checks in the
 * prior_state field of a plan.
 */
export interface CheckResult {
  /**
   * address identifies which object this check result is for. The kind field
   * within address determines the type of checkable object.
   */
  address: CheckAddress;

  /**
   * status is the aggregate check status for this object across all its
   * instances. If any instance fails, the object status is "fail"; if any
   * instance errors, the object status is "error"; otherwise it reflects the
   * collective result.
   * 
   * Valid values: "pass", "fail", "error", "unknown".
   */
  status: CheckStatus;

  /**
   * instances lists the per-instance check results for this object. An object
   * may have multiple instances when count or for_each is used.
   * 
   * If instances is empty or undefined:
   *   - When status is "pass" or "error": the object has zero instances (e.g.
   *     count = 0), so there is nothing to check but the object exists.
   *   - When status is "unknown": an error prevented evaluation of count or
   *     for_each, so the number of instances could not be determined.
   * 
   * UI note (from both tools' documentation): prefer listing instances rather
   * than top-level objects; if an object has zero instances, show the top-level
   * object as a placeholder to indicate it was evaluated.
   */
  instances?: CheckInstance[];
}

/**
 * CheckAddress identifies a checkable object in the checks representation.
 * The fields present depend on the kind.
 */
export interface CheckAddress {
  /**
   * kind identifies the type of checkable object. Valid values:
   *   - "resource"      — managed or data resource
   *   - "output_value"  — module output with precondition
   *   - "check"         — standalone check block (both tools)
   *   - "var"           — input variable validation (OPENTOFU ONLY)
   * 
   * Treat unrecognized kind values defensively; new kinds may be added in
   * future versions.
   */
  kind: string;

  /**
   * to_display is an opaque, human-readable string identifying this object for
   * display in UI output. Treat this as a display hint only — do not parse it
   * programmatically.
   */
  to_display: string;

  /**
   * mode is only present when kind is "resource". Valid values: "managed",
   * "data", "ephemeral". Both tools may emit "ephemeral" here even though it
   * is not documented publicly.
   */
  mode?: string;

  /**
   * type is only present when kind is "resource". It is the resource type
   * string (e.g. "aws_instance").
   */
  type?: string;

  /**
   * name is only present when kind is "resource". It is the resource name
   * label from the configuration.
   */
  name?: string;

  /**
   * module is the opaque module address string for this object's containing
   * module. Omitted when the object is in the root module. Treat as opaque —
   * do not parse the structure of this string.
   */
  module?: string;
}

/**
 * CheckInstance is the per-instance check result for a single instance of a
 * checkable object (one element of a count or for_each expansion, or the sole
 * instance if neither is used).
 */
export interface CheckInstance {
  /**
   * address provides instance-specific addressing information.
   */
  address: CheckInstanceAddress;

  /**
   * status is the check result for this specific instance. Valid values:
   * "pass", "fail", "error", "unknown".
   */
  status: CheckStatus;

  /**
   * problems is populated when status is "fail" or "error". Each entry
   * contains the result of evaluating the error_message expression from one
   * failing or erroring condition block.
   * 
   * Omitted (undefined) when status is "pass" or "unknown".
   */
  problems?: CheckProblem[];
}

/**
 * CheckInstanceAddress provides addressing for a single check instance.
 */
export interface CheckInstanceAddress {
  /**
   * to_display is an opaque, human-readable string for this instance suitable
   * for display in UI output. Treat as a display hint only.
   */
  to_display: string;

  /**
   * instance_key is the instance key (index) for resources using count or
   * for_each. It is a number for count-based resources and a string for
   * for_each-based resources. Omitted for resources that have neither.
   */
  instance_key?: string | number;

  /**
   * module is the opaque module instance address for this instance's
   * containing module. Omitted when the instance is in the root module.
   * Treat as opaque — do not parse the structure of this string.
   */
  module?: string;
}

/**
 * CheckProblem represents a single failing or erroring condition within a
 * checkable object instance.
 */
export interface CheckProblem {
  /**
   * message is the result of evaluating the error_message expression from the
   * failing condition block. This is the human-readable description of what
   * went wrong and is suitable for display directly to users.
   */
  message: string;
}
