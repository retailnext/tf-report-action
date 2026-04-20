import type { BuildOptions } from "../builder/options.js";
import type { RenderOptions } from "../model/render-options.js";
import { parsePlan } from "../parser/index.js";
import { buildReport } from "../builder/index.js";
import { renderReport } from "../renderer/index.js";

/**
 * Converts an OpenTofu/Terraform plan JSON string into a GitHub-comment-ready
 * markdown string.
 *
 * @param json - The output of `tofu show -json <planfile>` or `terraform show -json <planfile>`
 * @param options - Optional rendering options
 * @returns Markdown string suitable for a GitHub issue or PR comment body
 */
export function planToMarkdown(
  json: string,
  options?: BuildOptions & RenderOptions,
): string {
  const plan = parsePlan(json);
  const report = buildReport(plan, options);
  return renderReport(report, options);
}
