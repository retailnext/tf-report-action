import type { BuildOptions } from "../builder/options.js";
import type { RenderOptions } from "../model/render-options.js";
import type { ComposedReport } from "../renderable/types.js";
import { parsePlan } from "../parser/index.js";
import { buildReport } from "../builder/index.js";
import { buildTitle } from "../builder/title.js";
import { buildReportElements } from "../elements/report-elements.js";
import { composeReport } from "../elements/composed-report.js";

/**
 * Converts an OpenTofu/Terraform plan JSON into a {@link ComposedReport} that
 * can render itself to markdown or HTML on demand.
 *
 * @param json - The output of `tofu show -json <planfile>` or `terraform show -json <planfile>`
 * @param options - Optional build/render options
 * @returns A ComposedReport with progressive-enhancement rendering
 */
export function planReport(
  json: string,
  options?: BuildOptions & RenderOptions,
): ComposedReport {
  const plan = parsePlan(json);
  const report = buildReport(plan, options);
  report.title = buildTitle(report);
  const elements = buildReportElements(report, options);
  return composeReport(elements);
}

/**
 * Converts an OpenTofu/Terraform plan JSON string into a GitHub-comment-ready
 * markdown string.
 *
 * Convenience wrapper around {@link planReport} for callers that only need
 * markdown output.
 *
 * @param json - The output of `tofu show -json <planfile>` or `terraform show -json <planfile>`
 * @param options - Optional rendering options
 * @returns Markdown string suitable for a GitHub issue or PR comment body
 */
export function planToMarkdown(
  json: string,
  options?: BuildOptions & RenderOptions,
): string {
  return planReport(json, options).render("markdown").output;
}
