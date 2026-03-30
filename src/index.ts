import type { BuildOptions } from "./builder/options.js";
import type { RenderOptions } from "./model/render-options.js";
import { parsePlan } from "./parser/index.js";
import { parseState } from "./parser/state.js";
import { buildReport } from "./builder/index.js";
import { buildApplyReport } from "./builder/apply.js";
import { enrichReportFromState } from "./builder/state-enrichment.js";
import { buildReportFromSteps } from "./builder/report-from-steps.js";
import { renderReport } from "./renderer/index.js";
import { renderReportSections } from "./renderer/report-sections.js";
import {
  composeSections,
  DEFAULT_MAX_OUTPUT_LENGTH,
} from "./compositor/index.js";
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
 * When `stateJson` is provided, attribute values that were unknown at plan time
 * are resolved to their actual post-apply values from the state. Sensitive
 * values discovered through the state are masked as `(sensitive)`.
 *
 * @param planJson - The output of `tofu show -json <planfile>` or `terraform show -json <planfile>`
 * @param applyJsonl - The JSON Lines output of `tofu apply -json` or `terraform apply -json`
 * @param options - Optional rendering options; include `stateJson` to resolve unknown values
 * @returns Markdown string suitable for a GitHub issue or PR comment body
 */
export function applyToMarkdown(
  planJson: string,
  applyJsonl: string,
  options?: Options & { stateJson?: string },
): string {
  const plan = parsePlan(planJson);
  const scanResult = scanString(applyJsonl);
  const report = buildApplyReport(plan, scanResult, options);
  if (options?.stateJson !== undefined) {
    const state = parseState(options.stateJson);
    enrichReportFromState(report, state);
  }
  return renderReport(report, options);
}

/**
 * Result of generating a report from a GitHub Actions steps context.
 *
 * Separates the budget-constrained markdown (for the comment body)
 * from the un-truncated full markdown (for artifact upload) so that
 * callers can handle truncation notices and artifact upload independently.
 */
export interface ReportFromStepsResult {
  /** Budget-constrained markdown (without truncation notice). */
  readonly markdown: string;
  /** Un-truncated markdown (all sections at full size, for artifact upload). */
  readonly fullMarkdown: string;
  /** Whether any section was degraded or omitted. */
  readonly wasTruncated: boolean;
  /** The detected operation type, if determinable from step context. */
  readonly operation?: "plan" | "apply" | "destroy";
  /** Whether any step failed without captured stdout/stderr output. */
  readonly hasUnresolvedFailures: boolean;
}

/**
 * Generates a report from a GitHub Actions steps context JSON string.
 *
 * **Never throws.** All errors are rendered as markdown content. The
 * budget-constrained output is in `markdown`; the un-truncated version
 * is in `fullMarkdown`.
 *
 * The `markdown` field does **not** include a truncation notice — the
 * caller is responsible for building and appending one (e.g. with a
 * link to an uploaded artifact or to workflow logs).
 *
 * This is the third pipeline, following the same parse → build → render → compose
 * pattern as planToMarkdown and applyToMarkdown.
 *
 * @param stepsJson - JSON-encoded GitHub Actions steps context
 * @param options - Report generation options
 * @returns Structured result with budget-constrained and full markdown
 */
export function reportFromSteps(
  stepsJson: string,
  options?: import("./builder/report-from-steps.js").ReportOptions,
): ReportFromStepsResult {
  try {
    const maxOutputLength =
      options?.maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;

    // Build: parse steps → detect tier → build appropriate Report variant
    const report = buildReportFromSteps(stepsJson, options);

    // Render: Report → Section[]
    const sections = renderReportSections(report, options);

    // Full markdown: all sections at full size (for artifact upload)
    const fullMarkdown = sections.map((s) => s.full).join("");

    // Compose: Section[] → bounded output string
    const result = composeSections(sections, maxOutputLength);

    return {
      markdown: result.output,
      fullMarkdown,
      wasTruncated: result.wasTruncated,
      ...(report.operation !== undefined && { operation: report.operation }),
      hasUnresolvedFailures: report.hasUnresolvedFailures ?? false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const errorMarkdown = `## ${STATUS_FAILURE} Report Generation Failed\n\nAn unexpected error occurred while generating the report:\n\n\`\`\`\n${message}\n\`\`\`\n`;
    return {
      markdown: errorMarkdown,
      fullMarkdown: errorMarkdown,
      wasTruncated: false,
      hasUnresolvedFailures: false,
    };
  }
}

// Re-export types and utilities consumers may need
export type { BuildOptions } from "./builder/options.js";
export type { RenderOptions, DiffFormat } from "./model/render-options.js";
export type { Report, RawStepStdout, Tool } from "./model/report.js";
export type { StepRole } from "./model/step-commands.js";
export { expectedCommand } from "./model/step-commands.js";
export {
  buildTruncationNotice,
  buildLogsNotice,
} from "./compositor/truncation.js";
export type { TruncationLink } from "./compositor/truncation.js";
export type { Summary } from "./model/summary.js";
export type { ResourceChange } from "./model/resource.js";
export type { AttributeChange } from "./model/attribute.js";
export type { OutputChange } from "./model/output.js";
export type { PlanAction } from "./model/plan-action.js";
export type { Diagnostic } from "./model/diagnostic.js";
export type { ApplyStatus } from "./model/apply-status.js";
export type { Env } from "./steps/types.js";
