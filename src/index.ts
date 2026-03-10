import type { BuildOptions } from "./builder/options.js";
import type { RenderOptions } from "./renderer/options.js";
import { parsePlan } from "./parser/index.js";
import { buildReport } from "./builder/index.js";
import { renderReport } from "./renderer/index.js";

export type Options = BuildOptions & RenderOptions;

/**
 * Converts a Terraform/OpenTofu plan JSON string into a GitHub-comment-ready
 * markdown string.
 *
 * @param json - The output of `terraform show -json <planfile>` or `tofu show -json <planfile>`
 * @param options - Optional rendering options
 * @returns Markdown string suitable for a GitHub issue or PR comment body
 */
export function planToMarkdown(json: string, options?: Options): string {
  const plan = parsePlan(json);
  const report = buildReport(plan, options);
  return renderReport(report, options);
}

// Re-export types consumers may need
export type { BuildOptions } from "./builder/options.js";
export type { RenderOptions, DiffFormat } from "./renderer/options.js";
export type { Report } from "./model/report.js";
export type { Summary } from "./model/summary.js";
export type { ResourceChange } from "./model/resource.js";
export type { AttributeChange } from "./model/attribute.js";
export type { OutputChange } from "./model/output.js";
export type { ModuleGroup } from "./model/module-group.js";
export type { PlanAction } from "./model/plan-action.js";
