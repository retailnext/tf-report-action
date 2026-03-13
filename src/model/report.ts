import type { ModuleGroup } from "./module-group.js";
import type { Summary } from "./summary.js";
import type { OutputChange } from "./output.js";
import type { Diagnostic } from "./diagnostic.js";
import type { ApplyStatus } from "./apply-status.js";

export interface Report {
  /** terraform_version field from the plan (may be a Terraform or OpenTofu version string). */
  toolVersion: string | null;
  formatVersion: string;
  /** timestamp field from the plan, if present (OpenTofu plans include this). */
  timestamp: string | null;
  summary: Summary;
  /** Resources grouped by module. Root module resources have moduleAddress === "". */
  modules: ModuleGroup[];
  /** Top-level output changes (not inside any module). */
  outputs: OutputChange[];
  /**
   * Resources whose real-world state has drifted from the prior state,
   * grouped by module. Populated from plan.resource_drift.
   * Empty array when no drift is detected.
   */
  driftModules: ModuleGroup[];
  /**
   * Diagnostics (errors and warnings) from the apply run.
   * Only present in apply reports; undefined for plan-only reports.
   */
  diagnostics?: Diagnostic[];
  /**
   * Per-resource apply outcomes (success/failure, elapsed time).
   * Only present in apply reports; undefined for plan-only reports.
   */
  applyStatuses?: ApplyStatus[];
}
