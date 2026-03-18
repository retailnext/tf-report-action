/**
 * State types for Terraform/OpenTofu JSON state output.
 */

import type { StateValues } from "./values.js";
import type { CheckResult } from "./checks.js";

/**
 * State represents the JSON state output, as embedded in Plan.prior_state and
 * also produced by `terraform show -json` / `tofu show -json` when given a
 * state file rather than a plan file.
 *
 * The prior_state in a plan is the recorded state at the beginning of planning —
 * what was last successfully applied. It may differ from the current real-world
 * state; drifts between them appear in Plan.resource_drift.
 */
export interface State {
  /**
   * format_version is the version of the state JSON format. Currently "1.0"
   * in both tools. A minor version bump indicates backward-compatible
   * additions; a major version bump is breaking. Consumers should check only
   * the major version component for compatibility.
   */
  format_version: string;

  /**
   * terraform_version is the version of the tool that last successfully applied
   * this state. OpenTofu retains the "terraform_version" key name for
   * backward compatibility, but the value will be an OpenTofu version string
   * (e.g. "1.7.0") when the state was last written by OpenTofu.
   */
  terraform_version?: string;

  /**
   * values contains the complete state values — all resource attributes and
   * output values as they were last recorded. Unlike planned_values, all
   * values in the prior state are fully known (the state is always a complete
   * snapshot).
   *
   * Undefined when the state is empty (no resources have been applied yet).
   */
  values?: StateValues;

  /**
   * checks contains the check/condition results that were recorded in this
   * state. This reflects the check statuses as of the last successful apply.
   *
   * Stability: In Terraform this is marked EXPERIMENTAL; in OpenTofu it is
   * considered stable.
   *
   * OPENTOFU ONLY in state output — Terraform does not embed checks in state
   * JSON. However, both tools include checks in the top-level plan output.
   */
  checks?: CheckResult[];
}
