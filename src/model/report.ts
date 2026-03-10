import type { ModuleGroup } from "./module-group.js";
import type { Summary } from "./summary.js";
import type { OutputChange } from "./output.js";

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
}
