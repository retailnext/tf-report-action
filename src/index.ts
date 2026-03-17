import type { BuildOptions } from "./builder/options.js";
import type { RenderOptions } from "./model/render-options.js";
import { parsePlan } from "./parser/index.js";
import { buildReport } from "./builder/index.js";
import { buildApplyReport } from "./builder/apply.js";
import { buildReportFromSteps } from "./builder/report-from-steps.js";
import { renderReport } from "./renderer/index.js";
import { renderReportSections } from "./renderer/report-sections.js";
import {
  composeSections,
  DEFAULT_MAX_OUTPUT_LENGTH,
} from "./compositor/index.js";
import { buildTruncationNotice } from "./compositor/truncation.js";
import { STATUS_FAILURE } from "./model/status-icons.js";
import { scanString } from "./jsonl-scanner/scan.js";

export type Options = BuildOptions & RenderOptions;

// Re-export the ReportOptions type from the builder
export type { ReportOptions } from "./builder/report-from-steps.js";

/**
 * Converts an OpenTofu/Terraform plan JSON string into a GitHub-comment-ready
 * markdown string.
 *
 * @param json - The output of `tofu show -json <planfile>` or `terraform show -json <planfile>`
 * @param options - Optional rendering options
 * @returns Markdown string suitable for a GitHub issue or PR comment body
 */
export function planToMarkdown(json: string, options?: Options): string {
  const plan = parsePlan(json);
  const report = buildReport(plan, options);
  return renderReport(report, options);
}

/**
 * Converts an OpenTofu/Terraform plan JSON string and apply JSONL output into
 * a GitHub-comment-ready markdown string showing what was actually changed.
 *
 * The apply report filters out "phantom" changes — resources that appeared in
 * the plan but were not actually modified during apply. It also includes
 * diagnostics (errors/warnings) and per-resource apply outcomes.
 *
 * @param planJson - The output of `tofu show -json <planfile>` or `terraform show -json <planfile>`
 * @param applyJsonl - The JSON Lines output of `tofu apply -json` or `terraform apply -json`
 * @param options - Optional rendering options
 * @returns Markdown string suitable for a GitHub issue or PR comment body
 */
export function applyToMarkdown(
  planJson: string,
  applyJsonl: string,
  options?: Options,
): string {
  const plan = parsePlan(planJson);
  const scanResult = scanString(applyJsonl);
  const report = buildApplyReport(plan, scanResult, options);
  return renderReport(report, options);
}

/**
 * Generates a GitHub-comment-ready markdown string from a GitHub Actions
 * steps context JSON string.
 *
 * **Never throws.** All errors are rendered as markdown content. Output
 * length is bounded by `maxOutputLength`.
 *
 * This is the third pipeline, following the same parse → build → render → compose
 * pattern as planToMarkdown and applyToMarkdown.
 *
 * @param stepsJson - JSON-encoded GitHub Actions steps context
 * @param options - Report generation options
 * @returns Markdown string suitable for a GitHub issue or PR comment body
 */
export function reportFromSteps(
  stepsJson: string,
  options?: import("./builder/report-from-steps.js").ReportOptions,
): string {
  try {
    return reportFromStepsInner(stepsJson, options);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return `## ${STATUS_FAILURE} Report Generation Failed\n\nAn unexpected error occurred while generating the report:\n\n\`\`\`\n${message}\n\`\`\`\n`;
  }
}

function reportFromStepsInner(
  stepsJson: string,
  options?: import("./builder/report-from-steps.js").ReportOptions,
): string {
  const maxOutputLength = options?.maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;

  // Build: parse steps → detect tier → build appropriate Report variant
  const report = buildReportFromSteps(stepsJson, options);

  // Render: Report → Section[]
  const sections = renderReportSections(report, options);

  // Extract logsUrl for truncation notice
  const logsUrl = getLogsUrl(report);
  const truncationNotice = buildTruncationNotice(logsUrl);

  // Compose: Section[] → bounded output string
  const composeBudget = maxOutputLength - truncationNotice.length;
  const result = composeSections(sections, composeBudget);

  if (result.degradedCount > 0 || result.omittedCount > 0) {
    return result.output + truncationNotice;
  }
  return result.output;
}

/** Extract logsUrl from the report. */
function getLogsUrl(
  report: import("./model/report.js").Report,
): string | undefined {
  return report.logsUrl;
}

// Re-export types consumers may need
export type { BuildOptions } from "./builder/options.js";
export type { RenderOptions, DiffFormat } from "./model/render-options.js";
export type { Report, RawStepStdout, Tool } from "./model/report.js";
export type { StepRole } from "./model/step-commands.js";
export { expectedCommand } from "./model/step-commands.js";
export type { Summary } from "./model/summary.js";
export type { ResourceChange } from "./model/resource.js";
export type { AttributeChange } from "./model/attribute.js";
export type { OutputChange } from "./model/output.js";
export type { PlanAction } from "./model/plan-action.js";
export type { Diagnostic } from "./model/diagnostic.js";
export type { ApplyStatus } from "./model/apply-status.js";
export type { Env } from "./steps/types.js";
