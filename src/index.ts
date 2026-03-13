import type { BuildOptions } from "./builder/options.js";
import type { RenderOptions } from "./renderer/options.js";
import { parsePlan } from "./parser/index.js";
import { parseUILog } from "./parser/index.js";
import { buildReport } from "./builder/index.js";
import { buildApplyReport } from "./builder/apply.js";
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

/**
 * Converts a Terraform/OpenTofu plan JSON string and apply JSONL output into
 * a GitHub-comment-ready markdown string showing what was actually changed.
 *
 * The apply report filters out "phantom" changes — resources that appeared in
 * the plan but were not actually modified during apply. It also includes
 * diagnostics (errors/warnings) and per-resource apply outcomes.
 *
 * @param planJson - The output of `terraform show -json <planfile>` or `tofu show -json <planfile>`
 * @param applyJsonl - The JSON Lines output of `terraform apply -json` or `tofu apply -json`
 * @param options - Optional rendering options
 * @returns Markdown string suitable for a GitHub issue or PR comment body
 */
export function applyToMarkdown(
  planJson: string,
  applyJsonl: string,
  options?: Options,
): string {
  const plan = parsePlan(planJson);
  const messages = parseUILog(applyJsonl);
  const report = buildApplyReport(plan, messages, options);
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
export type { Diagnostic } from "./model/diagnostic.js";
export type { ApplyStatus } from "./model/apply-status.js";
