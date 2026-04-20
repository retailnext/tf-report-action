import type { ReportOptions } from "../builder/report-from-steps.js";
export type { ReportOptions };
import { buildReportFromSteps } from "../builder/report-from-steps.js";
import { renderReportSections } from "../renderer/report-sections.js";
import { composeWithBudget } from "../compose/index.js";
import { STATUS_FAILURE } from "../model/status-icons.js";

/** Default maximum output length (63 KiB). */
const DEFAULT_MAX_OUTPUT_LENGTH = 64512;

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
  options?: ReportOptions,
): ReportFromStepsResult {
  try {
    const maxOutputLength =
      options?.maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;

    // Build: parse steps → detect tier → build appropriate Report variant
    const report = buildReportFromSteps(stepsJson, options);

    // Render: Report → Section[] (used for fullMarkdown and fixed content)
    const sections = renderReportSections(report, options);

    // Full markdown: all sections at full size (for artifact upload)
    const fullMarkdown = sections.map((s) => s.full).join("");

    // Compose progressively: fixed content + flex categories within budget
    const result = composeWithBudget(
      sections,
      report,
      options ?? {},
      maxOutputLength,
    );

    return {
      markdown: result.markdown,
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
